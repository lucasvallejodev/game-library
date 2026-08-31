import type { GameDetail, GameList, GameType, Genre, Location } from '@game-library/shared/schemas'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestUser, type TestUser } from './helpers/auth-client.js'
import { startTestServer, type TestServer } from './helpers/test-server.js'

let s: TestServer
let user: TestUser

/** Taxonomy ids, resolved once so the filter tests can reference them. */
const ids: Record<string, string> = {}

async function createLocation(name: string, color: string): Promise<string> {
  const res = await user.request('POST', '/api/locations', { name, color })
  return res.json<Location>().id
}

async function createGame(body: Record<string, unknown>): Promise<GameDetail> {
  const res = await user.request('POST', '/api/games', body)
  if (res.statusCode !== 201)
    throw new Error(`create failed ${String(res.statusCode)}: ${res.body}`)
  return res.json<GameDetail>()
}

async function list(query = ''): Promise<GameList> {
  const res = await user.request('GET', `/api/games${query}`)
  expect(res.statusCode, `GET /api/games${query}`).toBe(200)
  return res.json<GameList>()
}

const names = (result: GameList): string[] => result.data.map((g) => g.name)

beforeAll(async () => {
  s = await startTestServer({ migrate: true })
  await s.app.ready()
  user = await createTestUser(s.app, 'games')

  ids.gog = await createLocation('GOG', '#7B4FBF')
  ids.steam = await createLocation('Steam', '#1B2838')
  ids.drive = await createLocation('WD 4TB', '#2F9BFF')

  const types = (await user.request('GET', '/api/game-types')).json<{ data: GameType[] }>().data
  ids.digital = types.find((t) => t.slug === 'digital')!.id
  ids.physical = types.find((t) => t.slug === 'physical')!.id

  const genres = (await user.request('GET', '/api/genres')).json<{ data: Genre[] }>().data
  ids.rpg = genres.find((g) => g.slug === 'rpg')!.id
  ids.strategy = genres.find((g) => g.slug === 'strategy')!.id
  ids.shooter = genres.find((g) => g.slug === 'shooter')!.id

  // A deliberately overlapping fixture set, so every filter has both hits
  // and misses and combinations are not trivially satisfied.
  await createGame({
    name: 'The Witcher 3',
    igdbId: 1942,
    gameTypeId: ids.digital,
    locationIds: [ids.gog, ids.steam, ids.drive], // in three at once
    genreIds: [ids.rpg],
    releaseDate: '2015-05-18',
  })
  await createGame({
    name: 'Civilization VI',
    gameTypeId: ids.digital,
    locationIds: [ids.steam],
    genreIds: [ids.strategy],
    releaseDate: '2016-10-21',
  })
  await createGame({
    name: 'A Plague Tale',
    gameTypeId: ids.physical,
    locationIds: [ids.gog],
    genreIds: [ids.rpg, ids.shooter],
    releaseDate: '2019-05-14',
  })
  await createGame({
    name: 'Anno 1800',
    locationIds: [],
    genreIds: [ids.strategy],
  })
}, 240_000)

afterAll(async () => {
  await s.stop()
})

describe('creating games', () => {
  it('returns the game with its chips resolved', async () => {
    const game = await createGame({
      name: 'Hades',
      gameTypeId: ids.digital,
      locationIds: [ids.steam],
      genreIds: [ids.rpg],
    })

    expect(game).toMatchObject({
      name: 'Hades',
      sortName: 'Hades',
      gameType: { id: ids.digital, name: 'Digital' },
      coverUrl: null,
    })
    expect(game.locations).toEqual([{ id: ids.steam, name: 'Steam', color: '#1B2838' }])
    expect(game.genres.map((g) => g.name)).toEqual(['RPG'])

    await user.request('DELETE', `/api/games/${game.id}`)
  })

  it('derives sortName in Postgres, stripping a leading article', async () => {
    const result = await list('?q=Witcher')
    expect(result.data[0]?.sortName).toBe('Witcher 3')
  })

  it('blocks a second copy of the same IGDB title and names the existing one', async () => {
    const res = await user.request('POST', '/api/games', { name: 'Witcher again', igdbId: 1942 })

    expect(res.statusCode).toBe(409)
    const body = res.json<{ error: { code: string; details: { existingGameName: string } } }>()
    expect(body.error.code).toBe('CONFLICT')
    // The UI links straight to the game you already own — the point of the guard.
    expect(body.error.details.existingGameName).toBe('The Witcher 3')
  })

  it('allows any number of manual games with no IGDB id', async () => {
    const a = await createGame({ name: 'Homebrew One' })
    const b = await createGame({ name: 'Homebrew Two' })
    expect(a.igdbId).toBeNull()
    expect(b.igdbId).toBeNull()

    await user.request('DELETE', `/api/games/${a.id}`)
    await user.request('DELETE', `/api/games/${b.id}`)
  })

  it('refuses taxonomy ids belonging to another user', async () => {
    const intruder = await createTestUser(s.app, 'games-intruder')
    const theirLocation = (
      await intruder.request('POST', '/api/locations', { name: 'Theirs', color: '#000000' })
    ).json<Location>()

    // A foreign key only proves the row exists, not that it is yours. Without
    // the ownership check this would attach — and leak their location's name
    // and colour back through the card chips.
    const res = await user.request('POST', '/api/games', {
      name: 'Trespasser',
      locationIds: [theirLocation.id],
    })

    expect(res.statusCode).toBe(422)
    expect(res.json<{ error: { message: string } }>().error.message).toMatch(/locations/)
  })
})

describe('filtering', () => {
  it('returns everything with no filters', async () => {
    const result = await list()
    expect(names(result).sort()).toEqual([
      'A Plague Tale',
      'Anno 1800',
      'Civilization VI',
      'The Witcher 3',
    ])
    expect(result.meta.total).toBe(4)
  })

  it('returns a multi-location game exactly once', async () => {
    // The Witcher 3 is in all three locations. A JOIN-based filter would
    // return it three times; EXISTS returns it once.
    const result = await list(
      `?locationId=${ids.gog}&locationId=${ids.steam}&locationId=${ids.drive}`,
    )

    const witchers = result.data.filter((g) => g.name === 'The Witcher 3')
    expect(witchers).toHaveLength(1)
    expect(witchers[0]?.locations).toHaveLength(3)
    // total must agree with the row count, not count duplicates.
    expect(result.meta.total).toBe(result.data.length)
  })

  it('filters by name, case-insensitively and on a substring', async () => {
    expect(names(await list('?q=witcher'))).toEqual(['The Witcher 3'])
    expect(names(await list('?q=WITCHER'))).toEqual(['The Witcher 3'])
    expect(names(await list('?q=ann'))).toEqual(['Anno 1800'])
    expect(names(await list('?q=zzzz'))).toEqual([])
  })

  it('treats LIKE wildcards in the search term literally', async () => {
    // '%' would otherwise match everything.
    expect(names(await list('?q=%25'))).toEqual([])
    expect(names(await list('?q=_'))).toEqual([])
  })

  it('filters by a single location', async () => {
    expect(names(await list(`?locationId=${ids.gog}`)).sort()).toEqual([
      'A Plague Tale',
      'The Witcher 3',
    ])
    expect(names(await list(`?locationId=${ids.drive}`))).toEqual(['The Witcher 3'])
  })

  it('ORs repeated values of the same filter', async () => {
    expect(names(await list(`?genreId=${ids.rpg}&genreId=${ids.strategy}`)).sort()).toEqual([
      'A Plague Tale',
      'Anno 1800',
      'Civilization VI',
      'The Witcher 3',
    ])
  })

  it('filters by game type', async () => {
    expect(names(await list(`?gameTypeId=${ids.physical}`))).toEqual(['A Plague Tale'])
    expect(names(await list(`?gameTypeId=${ids.digital}`)).sort()).toEqual([
      'Civilization VI',
      'The Witcher 3',
    ])
  })

  it('ANDs across different filter types', async () => {
    // Strategy AND on Steam -> Civ only (Anno is Strategy but has no location).
    expect(names(await list(`?genreId=${ids.strategy}&locationId=${ids.steam}`))).toEqual([
      'Civilization VI',
    ])

    // RPG AND on GOG -> Witcher and Plague Tale.
    expect(names(await list(`?genreId=${ids.rpg}&locationId=${ids.gog}`)).sort()).toEqual([
      'A Plague Tale',
      'The Witcher 3',
    ])

    // "a Strategy game, on GOG or Steam" — the example from the API docs.
    expect(
      names(await list(`?genreId=${ids.strategy}&locationId=${ids.gog}&locationId=${ids.steam}`)),
    ).toEqual(['Civilization VI'])
  })

  it('combines all four filters at once', async () => {
    const q = `?q=witcher&locationId=${ids.gog}&gameTypeId=${ids.digital}&genreId=${ids.rpg}`
    expect(names(await list(q))).toEqual(['The Witcher 3'])

    // One contradictory term is enough to empty the result.
    const contradictory = `?q=witcher&locationId=${ids.gog}&gameTypeId=${ids.physical}&genreId=${ids.rpg}`
    expect(names(await list(contradictory))).toEqual([])
  })

  it('returns an empty page rather than an error when nothing matches', async () => {
    const result = await list('?q=nothing-matches-this')
    expect(result.data).toEqual([])
    expect(result.meta).toMatchObject({ total: 0, totalPages: 1 })
  })
})

describe('sorting and pagination', () => {
  it('sorts by sortName, ignoring a leading article', async () => {
    // "The Witcher 3" files under W, so it comes last.
    expect(names(await list('?sort=name'))).toEqual([
      'Anno 1800',
      'Civilization VI',
      'A Plague Tale',
      'The Witcher 3',
    ])
    expect(names(await list('?sort=-name'))).toEqual([
      'The Witcher 3',
      'A Plague Tale',
      'Civilization VI',
      'Anno 1800',
    ])
  })

  it('sorts by release date', async () => {
    const result = await list('?sort=releaseDate')
    // Anno has no release date; Postgres sorts NULLs last on ASC.
    expect(names(result).slice(0, 3)).toEqual(['The Witcher 3', 'Civilization VI', 'A Plague Tale'])
  })

  it('paginates with correct meta', async () => {
    const first = await list('?perPage=2&page=1&sort=name')
    expect(names(first)).toEqual(['Anno 1800', 'Civilization VI'])
    expect(first.meta).toEqual({ page: 1, perPage: 2, total: 4, totalPages: 2 })

    const second = await list('?perPage=2&page=2&sort=name')
    expect(names(second)).toEqual(['A Plague Tale', 'The Witcher 3'])
    expect(second.meta.page).toBe(2)

    const third = await list('?perPage=2&page=3&sort=name')
    expect(third.data).toEqual([])
  })

  it('rejects an out-of-range perPage', async () => {
    expect((await user.request('GET', '/api/games?perPage=500')).statusCode).toBe(422)
    expect((await user.request('GET', '/api/games?page=0')).statusCode).toBe(422)
    expect((await user.request('GET', '/api/games?sort=bogus')).statusCode).toBe(422)
  })
})

describe('updating', () => {
  it('replaces the whole location set, including with an empty array', async () => {
    const game = await createGame({ name: 'Mutable', locationIds: [ids.gog, ids.steam] })
    expect(game.locations).toHaveLength(2)

    const swapped = (
      await user.request('PATCH', `/api/games/${game.id}`, { locationIds: [ids.drive] })
    ).json<GameDetail>()
    expect(swapped.locations.map((l) => l.name)).toEqual(['WD 4TB'])

    const cleared = (
      await user.request('PATCH', `/api/games/${game.id}`, { locationIds: [] })
    ).json<GameDetail>()
    expect(cleared.locations).toEqual([])

    await user.request('DELETE', `/api/games/${game.id}`)
  })

  it('clears a nullable field when sent null', async () => {
    const game = await createGame({ name: 'Notable', notes: '# heading', gameTypeId: ids.digital })
    expect(game.notes).toBe('# heading')

    const cleared = (
      await user.request('PATCH', `/api/games/${game.id}`, { notes: null, gameTypeId: null })
    ).json<GameDetail>()
    expect(cleared.notes).toBeNull()
    expect(cleared.gameType).toBeNull()

    await user.request('DELETE', `/api/games/${game.id}`)
  })

  it('stores notes markdown verbatim', async () => {
    const raw = '# Save location\n\n`C:\\Users\\me` <script>alert(1)</script>'
    const game = await createGame({ name: 'Markdown', notes: raw })

    // Sanitizing happens at render, never at storage, so the text round-trips
    // exactly as typed. See docs/security.md §6.
    expect(game.notes).toBe(raw)
    await user.request('DELETE', `/api/games/${game.id}`)
  })

  it('rejects an empty patch', async () => {
    const result = await list('?q=Anno')
    const res = await user.request('PATCH', `/api/games/${result.data[0]!.id}`, {})
    expect(res.statusCode).toBe(422)
  })
})

describe('cross-tenant isolation', () => {
  it('never leaks, reads or mutates another user games', async () => {
    const intruder = await createTestUser(s.app, 'games-iso')

    expect((await intruder.request('GET', '/api/games')).json<GameList>().data).toEqual([])

    const mine = (await list('?q=Witcher')).data[0]!
    const attempts: [string, 'GET' | 'PATCH' | 'DELETE', unknown][] = [
      [`/api/games/${mine.id}`, 'GET', undefined],
      [`/api/games/${mine.id}`, 'PATCH', { name: 'Hijacked' }],
      [`/api/games/${mine.id}`, 'DELETE', undefined],
    ]

    for (const [url, method, payload] of attempts) {
      const res = await intruder.request(method, url, payload)
      expect(res.statusCode, `${method} ${url}`).toBe(404)
    }

    // Untouched.
    expect((await list('?q=Witcher')).data[0]?.name).toBe('The Witcher 3')
  })

  it('requires a session', async () => {
    expect((await s.app.inject({ method: 'GET', url: '/api/games' })).statusCode).toBe(401)
  })
})

/**
 * The name filter must be able to use the pg_trgm GIN index — that is the
 * entire reason it exists (docs/database.md §4). A btree index cannot serve a
 * leading-wildcard ILIKE at all, so this is checking the index is the right
 * *kind*, not merely that one exists.
 */
describe('query plan', () => {
  it('uses the trigram index for the name filter at realistic scale', async () => {
    // Row count matters: below roughly 10k rows a sequential scan is genuinely
    // cheaper and the planner is right to choose it. Asserting on a small
    // table would be testing the planner, not the schema — so plant enough
    // rows that the index is the honest winner.
    await s.app.db.execute(
      sql.raw(
        `INSERT INTO games (id, user_id, name)
         SELECT gen_random_uuid(), '${user.id}', 'Filler Title ' || g
         FROM generate_series(1, 50000) g`,
      ),
    )
    await s.app.db.execute(sql.raw('ANALYZE games'))

    const plan = await s.app.db.execute(
      sql.raw(`EXPLAIN (FORMAT JSON) SELECT id FROM games WHERE name ILIKE '%witcher%'`),
    )

    const text = JSON.stringify(plan)
    expect(text).toContain('games_name_trgm_idx')
    expect(text).toContain('Bitmap Index Scan')

    // Leave the table as we found it so later assertions are unaffected.
    await s.app.db.execute(sql.raw("DELETE FROM games WHERE name LIKE 'Filler Title %'"))
    await s.app.db.execute(sql.raw('ANALYZE games'))
  }, 120_000)
})
