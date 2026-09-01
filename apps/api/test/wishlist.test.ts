import type {
  DuplicateCheck,
  GameDetail,
  Location,
  WishlistItem,
  WishlistList,
} from '@game-library/shared/schemas'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestUser, type TestUser } from './helpers/auth-client.js'
import { startTestServer, type TestServer } from './helpers/test-server.js'

let s: TestServer
let user: TestUser

async function addWanted(body: Record<string, unknown>): Promise<WishlistItem> {
  const res = await user.request('POST', '/api/wishlist', body)
  if (res.statusCode !== 201)
    throw new Error(`create failed ${String(res.statusCode)}: ${res.body}`)
  return res.json<WishlistItem>()
}

beforeAll(async () => {
  s = await startTestServer({ migrate: true })
  await s.app.ready()
  user = await createTestUser(s.app, 'wishlist')
}, 240_000)

afterAll(async () => {
  await s.stop()
})

describe('wishlist CRUD', () => {
  it('starts empty', async () => {
    const res = await user.request('GET', '/api/wishlist')
    expect(res.statusCode).toBe(200)
    expect(res.json<WishlistList>().data).toEqual([])
  })

  it('adds an item with priority and a target price', async () => {
    const item = await addWanted({
      name: 'Silksong',
      priority: 'high',
      targetPrice: '29.99',
      currency: 'eur',
      storeUrl: 'https://store.steampowered.com/app/1030300',
    })

    expect(item).toMatchObject({
      name: 'Silksong',
      priority: 'high',
      targetPrice: '29.99',
      // Normalised to upper case, since ISO 4217 codes are upper case.
      currency: 'EUR',
    })
    // A price must never round-trip through a float.
    expect(typeof item.targetPrice).toBe('string')
  })

  it('defaults priority to medium', async () => {
    const item = await addWanted({ name: 'Unprioritised' })
    expect(item.priority).toBe('medium')
  })

  it('rejects a malformed price or currency', async () => {
    for (const body of [
      { name: 'Bad price', targetPrice: '29.999' },
      { name: 'Bad price 2', targetPrice: 'free' },
      { name: 'Bad currency', currency: 'EUROS' },
      { name: 'Bad url', storeUrl: 'not-a-url' },
    ]) {
      const res = await user.request('POST', '/api/wishlist', body)
      expect(res.statusCode, JSON.stringify(body)).toBe(422)
    }
  })

  it('updates and clears nullable fields', async () => {
    const item = await addWanted({ name: 'Mutable', targetPrice: '10.00', notes: '# hi' })

    const updated = (
      await user.request('PATCH', `/api/wishlist/${item.id}`, {
        priority: 'low',
        targetPrice: null,
        notes: null,
      })
    ).json<WishlistItem>()

    expect(updated.priority).toBe('low')
    expect(updated.targetPrice).toBeNull()
    expect(updated.notes).toBeNull()
  })

  it('stores notes markdown verbatim', async () => {
    const raw = '# Why I want it\n\n- co-op\n- <script>alert(1)</script>'
    const item = await addWanted({ name: 'Noted', notes: raw })
    // Sanitizing happens at render, never at storage (docs/security.md §6).
    expect(item.notes).toBe(raw)
  })

  it('rejects an empty patch', async () => {
    const item = await addWanted({ name: 'Untouched' })
    expect((await user.request('PATCH', `/api/wishlist/${item.id}`, {})).statusCode).toBe(422)
  })

  it('deletes an item', async () => {
    const item = await addWanted({ name: 'Doomed' })
    expect((await user.request('DELETE', `/api/wishlist/${item.id}`)).statusCode).toBe(204)
    expect((await user.request('GET', `/api/wishlist/${item.id}`)).statusCode).toBe(404)
  })

  it('filters by priority and sorts by it', async () => {
    const u = await createTestUser(s.app, 'wl-sort')
    for (const [name, priority] of [
      ['Low one', 'low'],
      ['High one', 'high'],
      ['Medium one', 'medium'],
    ] as const) {
      await u.request('POST', '/api/wishlist', { name, priority })
    }

    const high = (await u.request('GET', '/api/wishlist?priority=high')).json<WishlistList>()
    expect(high.data.map((i) => i.name)).toEqual(['High one'])

    // The enum is declared low → medium → high, so descending is most-wanted first.
    const sorted = (await u.request('GET', '/api/wishlist?sort=-priority')).json<WishlistList>()
    expect(sorted.data.map((i) => i.priority)).toEqual(['high', 'medium', 'low'])
  })
})

/**
 * The reason this project exists: knowing you already have something *before*
 * you buy it again.
 */
describe('duplicate-purchase guard', () => {
  it('reports a title you own, and where it lives', async () => {
    const u = await createTestUser(s.app, 'dupe-owned')

    const gog = (
      await u.request('POST', '/api/locations', { name: 'GOG', color: '#7B4FBF' })
    ).json<Location>()
    const drive = (
      await u.request('POST', '/api/locations', { name: 'WD 4TB', color: '#2F9BFF' })
    ).json<Location>()

    await u.request('POST', '/api/games', {
      name: 'The Witcher 3',
      igdbId: 1942,
      locationIds: [gog.id, drive.id],
    })

    const check = (await u.request('GET', '/api/wishlist/check?igdbId=1942')).json<DuplicateCheck>()

    expect(check.owned).toBe(true)
    expect(check.game?.name).toBe('The Witcher 3')
    // Where it is matters as much as whether you have it — "it's on the
    // external drive" is the answer that actually stops a second purchase.
    expect(check.game?.locations.map((l) => l.name).sort()).toEqual(['GOG', 'WD 4TB'])
    expect(check.wishlisted).toBe(false)
  })

  it('reports a title you have merely wishlisted', async () => {
    const u = await createTestUser(s.app, 'dupe-wanted')
    await u.request('POST', '/api/wishlist', { name: 'Hollow Knight', igdbId: 14593 })

    const check = (
      await u.request('GET', '/api/wishlist/check?igdbId=14593')
    ).json<DuplicateCheck>()
    expect(check.owned).toBe(false)
    expect(check.wishlisted).toBe(true)
    expect(check.wishlistItem?.name).toBe('Hollow Knight')
  })

  it('reports nothing for a title you have never seen', async () => {
    const u = await createTestUser(s.app, 'dupe-none')
    const check = (
      await u.request('GET', '/api/wishlist/check?igdbId=999999')
    ).json<DuplicateCheck>()
    expect(check).toEqual({ owned: false, game: null, wishlisted: false, wishlistItem: null })
  })

  it('refuses to wishlist a game already in the library', async () => {
    const u = await createTestUser(s.app, 'dupe-refuse')
    await u.request('POST', '/api/games', { name: 'Owned Already', igdbId: 4242 })

    const res = await u.request('POST', '/api/wishlist', { name: 'Owned Already', igdbId: 4242 })
    expect(res.statusCode).toBe(409)
    const body = res.json<{ error: { details: { reason: string; existingGameName: string } } }>()
    expect(body.error.details.reason).toBe('owned')
    expect(body.error.details.existingGameName).toBe('Owned Already')
  })

  it('refuses to wishlist the same title twice', async () => {
    const u = await createTestUser(s.app, 'dupe-twice')
    await u.request('POST', '/api/wishlist', { name: 'Wanted', igdbId: 555 })

    const res = await u.request('POST', '/api/wishlist', { name: 'Wanted again', igdbId: 555 })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ error: { details: { reason: string } } }>().error.details.reason).toBe(
      'wishlisted',
    )
  })

  it('is scoped per user — your library says nothing about mine', async () => {
    const owner = await createTestUser(s.app, 'dupe-scope-a')
    const other = await createTestUser(s.app, 'dupe-scope-b')

    await owner.request('POST', '/api/games', { name: 'Private', igdbId: 7777 })

    const theirs = (
      await other.request('GET', '/api/wishlist/check?igdbId=7777')
    ).json<DuplicateCheck>()
    expect(theirs.owned).toBe(false)
    expect(theirs.game).toBeNull()
  })
})

describe('promoting to the library', () => {
  it('moves the item across with its metadata, then removes it', async () => {
    const u = await createTestUser(s.app, 'promote')
    const steam = (
      await u.request('POST', '/api/locations', { name: 'Steam', color: '#1B2838' })
    ).json<Location>()

    const item = (
      await u.request('POST', '/api/wishlist', {
        name: 'Bought It',
        igdbId: 31313,
        notes: '# wanted for ages',
        priority: 'high',
      })
    ).json<WishlistItem>()

    const res = await u.request('POST', `/api/wishlist/${item.id}/promote`, {
      locationIds: [steam.id],
      acquiredAt: '2026-09-01',
    })

    expect(res.statusCode).toBe(201)
    const game = res.json<GameDetail>()
    expect(game).toMatchObject({
      name: 'Bought It',
      igdbId: 31313,
      // User-authored notes travel with it rather than being discarded.
      notes: '# wanted for ages',
      acquiredAt: '2026-09-01',
    })
    expect(game.locations.map((l) => l.name)).toEqual(['Steam'])

    // The wishlist entry is gone: it is owned now, not wanted.
    expect((await u.request('GET', `/api/wishlist/${item.id}`)).statusCode).toBe(404)
    expect((await u.request('GET', '/api/wishlist')).json<WishlistList>().data).toEqual([])
  })

  it('leaves the wishlist untouched when promoting fails', async () => {
    const u = await createTestUser(s.app, 'promote-fail')
    const item = (
      await u.request('POST', '/api/wishlist', { name: 'Stays Put' })
    ).json<WishlistItem>()

    // A location belonging to nobody: the whole transaction must roll back.
    const res = await u.request('POST', `/api/wishlist/${item.id}/promote`, {
      locationIds: ['00000000-0000-4000-8000-000000000000'],
    })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)

    // Still wanted, not silently lost.
    expect((await u.request('GET', `/api/wishlist/${item.id}`)).statusCode).toBe(200)
  })

  it('rejects promoting another user item', async () => {
    const owner = await createTestUser(s.app, 'promote-owner')
    const intruder = await createTestUser(s.app, 'promote-intruder')

    const item = (
      await owner.request('POST', '/api/wishlist', { name: 'Not Yours' })
    ).json<WishlistItem>()

    expect(
      (await intruder.request('POST', `/api/wishlist/${item.id}/promote`, {})).statusCode,
    ).toBe(404)
    expect((await owner.request('GET', `/api/wishlist/${item.id}`)).statusCode).toBe(200)
  })
})

describe('cross-tenant isolation', () => {
  it('returns 404 for every read, write and delete across tenants', async () => {
    const a = await createTestUser(s.app, 'wl-iso-a')
    const b = await createTestUser(s.app, 'wl-iso-b')

    const item = (
      await a.request('POST', '/api/wishlist', { name: 'Secret Want' })
    ).json<WishlistItem>()

    expect((await b.request('GET', '/api/wishlist')).json<WishlistList>().data).toEqual([])

    const attempts: [string, 'GET' | 'PATCH' | 'DELETE', unknown][] = [
      [`/api/wishlist/${item.id}`, 'GET', undefined],
      [`/api/wishlist/${item.id}`, 'PATCH', { name: 'Hijacked' }],
      [`/api/wishlist/${item.id}`, 'DELETE', undefined],
    ]
    for (const [url, method, payload] of attempts) {
      const res = await b.request(method, url, payload)
      expect(res.statusCode, `${method} ${url}`).toBe(404)
    }

    expect((await a.request('GET', `/api/wishlist/${item.id}`)).json<WishlistItem>().name).toBe(
      'Secret Want',
    )
  })

  it('requires a session', async () => {
    expect((await s.app.inject({ method: 'GET', url: '/api/wishlist' })).statusCode).toBe(401)
    expect(
      (await s.app.inject({ method: 'GET', url: '/api/wishlist/check?igdbId=1' })).statusCode,
    ).toBe(401)
  })
})
