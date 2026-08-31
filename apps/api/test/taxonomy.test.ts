import type { GameType, Genre, Location } from '@game-library/shared/schemas'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestUser, type TestUser } from './helpers/auth-client.js'
import { startTestServer, type TestServer } from './helpers/test-server.js'

let s: TestServer
let alice: TestUser

beforeAll(async () => {
  s = await startTestServer({ migrate: true })
  await s.app.ready()
  alice = await createTestUser(s.app, 'alice')
}, 240_000)

afterAll(async () => {
  await s.stop()
})

describe('locations', () => {
  it('starts empty — locations are personal, so nothing is seeded', async () => {
    const res = await alice.request('GET', '/api/locations')
    expect(res.statusCode).toBe(200)
    expect(res.json<{ data: Location[] }>().data).toEqual([])
  })

  it('creates a location and derives its slug from the name', async () => {
    const res = await alice.request('POST', '/api/locations', {
      name: 'WD 4TB External',
      color: '#2F9BFF',
    })

    expect(res.statusCode).toBe(201)
    const location = res.json<Location>()
    expect(location).toMatchObject({
      name: 'WD 4TB External',
      slug: 'wd-4tb-external',
      color: '#2F9BFF',
      sortOrder: 0,
      logoUrl: null,
      gameCount: 0,
    })
    expect(location.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('rejects a colour that is not #RRGGBB', async () => {
    for (const color of ['red', '#FFF', '2F9BFF', '#12345G']) {
      const res = await alice.request('POST', '/api/locations', { name: `bad-${color}`, color })
      expect(res.statusCode, `colour ${color} should be rejected`).toBe(422)
      expect(res.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR')
    }
  })

  it('rejects a duplicate name with 409, matching on slug not raw text', async () => {
    await alice.request('POST', '/api/locations', { name: 'GOG', color: '#7B4FBF' })

    // Different spacing and case, same slug — must still collide.
    const res = await alice.request('POST', '/api/locations', { name: '  gog  ', color: '#7B4FBF' })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ error: { code: string } }>().error.code).toBe('CONFLICT')
  })

  it('rejects a name with nothing sluggable', async () => {
    const res = await alice.request('POST', '/api/locations', { name: '!!!', color: '#7B4FBF' })
    expect(res.statusCode).toBe(422)
  })

  it('renames a location and regenerates the slug', async () => {
    const created = (
      await alice.request('POST', '/api/locations', { name: 'Old Drive', color: '#123456' })
    ).json<Location>()

    const res = await alice.request('PATCH', `/api/locations/${created.id}`, {
      name: 'New Drive',
      sortOrder: 5,
    })

    expect(res.statusCode).toBe(200)
    expect(res.json<Location>()).toMatchObject({
      name: 'New Drive',
      slug: 'new-drive',
      sortOrder: 5,
      color: '#123456',
    })
  })

  it('allows a no-op rename to its own current name', async () => {
    const created = (
      await alice.request('POST', '/api/locations', { name: 'Steady', color: '#123456' })
    ).json<Location>()

    // Must not 409 against itself.
    const res = await alice.request('PATCH', `/api/locations/${created.id}`, { name: 'Steady' })
    expect(res.statusCode).toBe(200)
  })

  it('rejects an empty PATCH body rather than silently doing nothing', async () => {
    const created = (
      await alice.request('POST', '/api/locations', { name: 'Untouched', color: '#123456' })
    ).json<Location>()

    const res = await alice.request('PATCH', `/api/locations/${created.id}`, {})
    expect(res.statusCode).toBe(422)
  })

  it('deletes a location', async () => {
    const created = (
      await alice.request('POST', '/api/locations', { name: 'Doomed', color: '#123456' })
    ).json<Location>()

    expect((await alice.request('DELETE', `/api/locations/${created.id}`)).statusCode).toBe(204)
    expect((await alice.request('GET', `/api/locations/${created.id}`)).statusCode).toBe(404)
  })

  it('orders by sortOrder then name', async () => {
    const bob = await createTestUser(s.app, 'ordering')
    await bob.request('POST', '/api/locations', { name: 'Zulu', color: '#111111', sortOrder: 0 })
    await bob.request('POST', '/api/locations', { name: 'Alpha', color: '#111111', sortOrder: 0 })
    await bob.request('POST', '/api/locations', { name: 'First', color: '#111111', sortOrder: -0 })

    const data = (await bob.request('GET', '/api/locations')).json<{ data: Location[] }>().data
    expect(data.map((l) => l.name)).toEqual(['Alpha', 'First', 'Zulu'])
  })

  it('returns 422 for a malformed id rather than 404', async () => {
    const res = await alice.request('GET', '/api/locations/not-a-uuid')
    expect(res.statusCode).toBe(422)
  })
})

describe('game types', () => {
  it('lists the four seeded defaults, flagged as defaults', async () => {
    const user = await createTestUser(s.app, 'gt-seed')
    const res = await user.request('GET', '/api/game-types')

    expect(res.statusCode).toBe(200)
    const data = res.json<{ data: GameType[] }>().data
    expect(data.map((t) => t.name).sort()).toEqual([
      'Digital',
      'Emulated',
      'Physical',
      'Subscription',
    ])
    expect(data.every((t) => t.isDefault)).toBe(true)
    expect(data.every((t) => t.gameCount === 0)).toBe(true)
  })

  it('creates a custom type that is not flagged as default', async () => {
    const user = await createTestUser(s.app, 'gt-custom')
    const res = await user.request('POST', '/api/game-types', { name: 'Cartridge' })

    expect(res.statusCode).toBe(201)
    expect(res.json<GameType>()).toMatchObject({
      name: 'Cartridge',
      slug: 'cartridge',
      isDefault: false,
    })
  })

  it('rejects a duplicate of a seeded default', async () => {
    const user = await createTestUser(s.app, 'gt-dupe')
    const res = await user.request('POST', '/api/game-types', { name: 'Digital' })
    expect(res.statusCode).toBe(409)
  })

  it('allows renaming a seeded default', async () => {
    const user = await createTestUser(s.app, 'gt-rename')
    const types = (await user.request('GET', '/api/game-types')).json<{ data: GameType[] }>().data
    const digital = types.find((t) => t.slug === 'digital')

    const res = await user.request('PATCH', `/api/game-types/${digital!.id}`, { name: 'Download' })
    expect(res.statusCode).toBe(200)
    expect(res.json<GameType>()).toMatchObject({ name: 'Download', slug: 'download' })
  })

  it('deletes a game type', async () => {
    const user = await createTestUser(s.app, 'gt-delete')
    const created = (
      await user.request('POST', '/api/game-types', { name: 'Temporary' })
    ).json<GameType>()

    expect((await user.request('DELETE', `/api/game-types/${created.id}`)).statusCode).toBe(204)
    expect((await user.request('GET', `/api/game-types/${created.id}`)).statusCode).toBe(404)
  })
})

describe('genres', () => {
  it('lists the fourteen seeded defaults', async () => {
    const user = await createTestUser(s.app, 'genre-seed')
    const data = (await user.request('GET', '/api/genres')).json<{ data: Genre[] }>().data

    expect(data).toHaveLength(14)
    expect(data.map((g) => g.name)).toContain('RPG')
    expect(data.every((g) => g.isDefault)).toBe(true)
    // Seeded genres carry no IGDB id until a mapping is established.
    expect(data.every((g) => g.igdbId === null)).toBe(true)
  })

  it('creates, renames and deletes a genre', async () => {
    const user = await createTestUser(s.app, 'genre-crud')

    const created = (
      await user.request('POST', '/api/genres', { name: 'Metroidvania' })
    ).json<Genre>()
    expect(created).toMatchObject({ name: 'Metroidvania', slug: 'metroidvania', isDefault: false })

    const renamed = await user.request('PATCH', `/api/genres/${created.id}`, {
      name: 'Search Action',
    })
    expect(renamed.json<Genre>().slug).toBe('search-action')

    expect((await user.request('DELETE', `/api/genres/${created.id}`)).statusCode).toBe(204)
  })

  it('rejects a duplicate genre name', async () => {
    const user = await createTestUser(s.app, 'genre-dupe')
    expect((await user.request('POST', '/api/genres', { name: 'RPG' })).statusCode).toBe(409)
  })
})

describe('authentication', () => {
  it('rejects every taxonomy route without a session', async () => {
    const routes: [string, string][] = [
      ['GET', '/api/locations'],
      ['POST', '/api/locations'],
      ['GET', '/api/game-types'],
      ['POST', '/api/game-types'],
      ['GET', '/api/genres'],
      ['POST', '/api/genres'],
    ]

    for (const [method, url] of routes) {
      const res = await s.app.inject({ method: method as 'GET', url, payload: {} })
      expect(res.statusCode, `${method} ${url}`).toBe(401)
      expect(res.json<{ error: { code: string } }>().error.code).toBe('UNAUTHENTICATED')
    }
  })
})

/**
 * The isolation matrix.
 *
 * This is the template every later resource module copies. Open registration
 * means every other user is a potential attacker, so each resource must prove
 * that user B cannot read, modify or delete user A's rows — and that it always
 * looks like a 404, never a 403, which would confirm the row exists.
 * See docs/security.md §3.
 */
describe('cross-tenant isolation', () => {
  it('never leaks another user rows in a list', async () => {
    const a = await createTestUser(s.app, 'iso-a')
    const b = await createTestUser(s.app, 'iso-b')

    await a.request('POST', '/api/locations', { name: 'Alice Drive', color: '#111111' })
    await a.request('POST', '/api/genres', { name: 'Alice Genre' })
    await a.request('POST', '/api/game-types', { name: 'Alice Type' })

    const bLocations = (await b.request('GET', '/api/locations')).json<{ data: Location[] }>().data
    const bGenres = (await b.request('GET', '/api/genres')).json<{ data: Genre[] }>().data
    const bTypes = (await b.request('GET', '/api/game-types')).json<{ data: GameType[] }>().data

    expect(bLocations).toEqual([])
    expect(bGenres.map((g) => g.name)).not.toContain('Alice Genre')
    expect(bTypes.map((t) => t.name)).not.toContain('Alice Type')
  })

  it('returns 404 — not 403 — for every read, write and delete across tenants', async () => {
    const a = await createTestUser(s.app, 'iso-read-a')
    const b = await createTestUser(s.app, 'iso-read-b')

    const location = (
      await a.request('POST', '/api/locations', { name: 'Secret Drive', color: '#111111' })
    ).json<Location>()
    const genre = (await a.request('POST', '/api/genres', { name: 'Secret Genre' })).json<Genre>()
    const gameType = (
      await a.request('POST', '/api/game-types', { name: 'Secret Type' })
    ).json<GameType>()

    const attempts: [string, 'GET' | 'PATCH' | 'DELETE', unknown][] = [
      [`/api/locations/${location.id}`, 'GET', undefined],
      [`/api/locations/${location.id}`, 'PATCH', { name: 'Hijacked' }],
      [`/api/locations/${location.id}`, 'DELETE', undefined],
      [`/api/genres/${genre.id}`, 'GET', undefined],
      [`/api/genres/${genre.id}`, 'PATCH', { name: 'Hijacked' }],
      [`/api/genres/${genre.id}`, 'DELETE', undefined],
      [`/api/game-types/${gameType.id}`, 'GET', undefined],
      [`/api/game-types/${gameType.id}`, 'PATCH', { name: 'Hijacked' }],
      [`/api/game-types/${gameType.id}`, 'DELETE', undefined],
    ]

    for (const [url, method, payload] of attempts) {
      const res = await b.request(method, url, payload)
      expect(res.statusCode, `${method} ${url} as the wrong user`).toBe(404)
      expect(res.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND')
    }
  })

  it("leaves the owner's data untouched after a failed cross-tenant attack", async () => {
    const a = await createTestUser(s.app, 'iso-intact-a')
    const b = await createTestUser(s.app, 'iso-intact-b')

    const location = (
      await a.request('POST', '/api/locations', { name: 'Fort Knox', color: '#ABCDEF' })
    ).json<Location>()

    await b.request('PATCH', `/api/locations/${location.id}`, { name: 'Hijacked' })
    await b.request('DELETE', `/api/locations/${location.id}`)

    const after = await a.request('GET', `/api/locations/${location.id}`)
    expect(after.statusCode).toBe(200)
    expect(after.json<Location>()).toMatchObject({ name: 'Fort Knox', color: '#ABCDEF' })
  })

  it('scopes uniqueness per user, so two users can hold the same name', async () => {
    const a = await createTestUser(s.app, 'iso-uniq-a')
    const b = await createTestUser(s.app, 'iso-uniq-b')

    expect(
      (await a.request('POST', '/api/locations', { name: 'Steam', color: '#1B2838' })).statusCode,
    ).toBe(201)
    expect(
      (await b.request('POST', '/api/locations', { name: 'Steam', color: '#1B2838' })).statusCode,
    ).toBe(201)
  })
})
