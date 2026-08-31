import { schema } from '@game-library/db'
import type { GameDetail } from '@game-library/shared/schemas'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestUser, type TestUser } from './helpers/auth-client.js'
import { startTestServer, type TestServer } from './helpers/test-server.js'

/**
 * Runs against the **real** IGDB API when Twitch credentials are present.
 *
 * A mock would only prove the mock works. What matters is that the
 * client-credentials flow, IGDB's query language, its response shape and its
 * image CDN all behave as assumed — and only the live service can show that.
 * Skipped rather than failed when credentials are absent, so CI without
 * secrets stays green.
 */
const clientId = process.env.TWITCH_CLIENT_ID
const clientSecret = process.env.TWITCH_CLIENT_SECRET
const live = Boolean(clientId && clientSecret)
const describeLive = live ? describe : describe.skip

let s: TestServer
let user: TestUser

interface IgdbResult {
  igdbId: number
  name: string
  releaseDate: string | null
  rating: number | null
  coverUrl: string | null
  genres: string[]
  inLibrary: boolean
  inWishlist: boolean
  existingGameId: string | null
}

beforeAll(async () => {
  if (!live) return
  s = await startTestServer({
    migrate: true,
    igdb: { TWITCH_CLIENT_ID: clientId ?? '', TWITCH_CLIENT_SECRET: clientSecret ?? '' },
  })
  await s.app.ready()
  user = await createTestUser(s.app, 'igdb')
}, 300_000)

afterAll(async () => {
  if (live) await s.stop()
})

describeLive('IGDB search (live)', () => {
  it('returns mapped results from the real API', async () => {
    const res = await user.request('GET', '/api/igdb/search?q=The%20Witcher%203&limit=5')

    expect(res.statusCode).toBe(200)
    const data = res.json<{ data: IgdbResult[] }>().data
    expect(data.length).toBeGreaterThan(0)

    const witcher = data.find((g) => g.igdbId === 1942)
    expect(witcher, 'IGDB id 1942 is The Witcher 3').toBeDefined()
    expect(witcher?.name).toContain('Witcher 3')
    // Mapped into our shape: IGDB's field names never reach the client.
    expect(witcher?.coverUrl).toMatch(/^https:\/\/images\.igdb\.com\//)
    expect(witcher?.genres).toContain('Role-playing (RPG)')
    expect(witcher?.inLibrary).toBe(false)
  }, 60_000)

  it('fetches one title by id', async () => {
    const res = await user.request('GET', '/api/igdb/games/1942')

    expect(res.statusCode).toBe(200)
    const game = res.json<IgdbResult>()
    expect(game.igdbId).toBe(1942)
    expect(game.releaseDate).toBe('2015-05-19')
    expect(game.rating ?? 0).toBeGreaterThan(50)
  }, 60_000)

  it('rejects a too-short query rather than spending an upstream call', async () => {
    expect((await user.request('GET', '/api/igdb/search?q=a')).statusCode).toBe(422)
  })

  it('requires a session — the proxy is never anonymous', async () => {
    const res = await s.app.inject({ method: 'GET', url: '/api/igdb/search?q=witcher' })
    expect(res.statusCode).toBe(401)
  })
})

describeLive('importing from IGDB (live)', () => {
  it('creates a game from an igdbId, mirroring metadata, genres and cover', async () => {
    const res = await user.request('POST', '/api/games', { name: 'The Witcher 3', igdbId: 1942 })
    expect(res.statusCode).toBe(201)

    const game = res.json<GameDetail>()
    expect(game.releaseDate).toBe('2015-05-19')
    expect(game.igdbRating ?? 0).toBeGreaterThan(50)
    expect(game.summary).toBeTruthy()

    // IGDB's "Role-playing (RPG)" is aliased onto the seeded "RPG" row rather
    // than creating a near-duplicate beside it.
    expect(game.genres.map((g) => g.name)).toContain('RPG')

    // The cover is mirrored into OUR storage, not hotlinked (ADR-008).
    expect(game.coverUrl).toMatch(/^\/api\/media\/[0-9a-f-]{36}\/cover\.webp$/)

    const assetId = game.coverUrl?.split('/')[3] ?? ''
    const rows = await s.app.db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, assetId))

    expect(rows[0]).toMatchObject({ source: 'igdb', mimeType: 'image/webp' })
    expect(rows[0]?.sourceUrl).toMatch(/^https:\/\/images\.igdb\.com\//)

    // And it actually serves.
    const served = await s.app.inject({
      method: 'GET',
      url: game.coverUrl ?? '',
      headers: { cookie: user.cookie },
    })
    expect(served.statusCode).toBe(200)
    expect(served.rawPayload.byteLength).toBeGreaterThan(1000)
  }, 120_000)

  it('now reports the title as already owned', async () => {
    // The duplicate-purchase guard, visible at the earliest possible moment:
    // before you add it, not after.
    const game = (await user.request('GET', '/api/igdb/games/1942')).json<IgdbResult>()

    expect(game.inLibrary).toBe(true)
    expect(game.existingGameId).toMatch(/^[0-9a-f-]{36}$/)
  }, 60_000)

  it('refuses a second copy of the same IGDB title', async () => {
    const res = await user.request('POST', '/api/games', { name: 'Dupe', igdbId: 1942 })
    expect(res.statusCode).toBe(409)
  }, 60_000)

  it('refreshes metadata without touching user-authored fields', async () => {
    const created = (
      await user.request('POST', '/api/games', { name: 'Placeholder', igdbId: 1020 })
    ).json<GameDetail>()

    await user.request('PATCH', `/api/games/${created.id}`, {
      notes: '# my notes',
      acquiredAt: '2020-01-01',
    })

    const refreshed = (
      await user.request('POST', `/api/games/${created.id}/refresh-igdb`)
    ).json<GameDetail>()

    // IGDB-owned fields refreshed...
    expect(refreshed.igdbId).toBe(1020)
    expect(refreshed.summary).toBeTruthy()
    expect(refreshed.name).not.toBe('Placeholder')
    // ...user-authored fields untouched. Refreshing metadata must never
    // silently discard what someone wrote.
    expect(refreshed.notes).toBe('# my notes')
    expect(refreshed.acquiredAt).toBe('2020-01-01')
  }, 120_000)

  it('rejects refresh for a game with no IGDB id', async () => {
    const manual = (
      await user.request('POST', '/api/games', { name: 'Homebrew' })
    ).json<GameDetail>()
    const res = await user.request('POST', `/api/games/${manual.id}/refresh-igdb`)
    expect(res.statusCode).toBe(422)
  })
})

describeLive('SSRF protection on cover mirroring', () => {
  it('refuses to fetch a cover from any host but IGDB over https', async () => {
    const { createMediaService } = await import('../src/modules/media/media.service.js')
    const { createMediaRepository } = await import('../src/modules/media/media.repository.js')

    const media = createMediaService({
      repo: createMediaRepository(s.app.db),
      storage: s.app.storage,
      maxUploadBytes: s.app.config.MAX_UPLOAD_BYTES,
      log: s.app.log,
    })

    // The classic SSRF targets: cloud metadata, loopback services, and a
    // lookalike hostname that a naive `endsWith` check would let through.
    for (const url of [
      'http://169.254.169.254/latest/meta-data/',
      'http://127.0.0.1:6379/',
      'https://evil.example/cover.jpg',
      'https://images.igdb.com.evil.example/cover.jpg',
      'http://images.igdb.com/cover.jpg',
    ]) {
      await expect(media.storeFromUrl(user.id, url), url).rejects.toThrow(/may only be fetched/)
    }
  })
})
