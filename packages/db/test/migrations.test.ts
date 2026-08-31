import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { newId } from '../src/id.js'
import { startTestDatabase, type TestDatabase } from './helpers/postgres-container.js'

let t: TestDatabase

beforeAll(async () => {
  t = await startTestDatabase()
}, 240_000)

afterAll(async () => {
  await t.stop()
})

/** Insert a Better Auth user row so foreign keys are satisfiable. */
async function createUser(email: string): Promise<string> {
  const id = newId()
  await t.sql`
    INSERT INTO "user" (id, name, email, email_verified)
    VALUES (${id}, ${'Test ' + email}, ${email}, true)
  `
  return id
}

describe('migrations apply from zero', () => {
  it('creates every expected table', async () => {
    const rows = await t.sql<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `
    const tables = rows.map((r) => r.tablename)

    expect(tables).toEqual(
      expect.arrayContaining([
        // Better Auth
        'account',
        'session',
        'user',
        'verification',
        // application
        'game_genres',
        'game_locations',
        'game_types',
        'games',
        'genres',
        'locations',
        'media_assets',
        'wishlist_item_genres',
        'wishlist_items',
      ]),
    )
    // 13 app/auth tables + drizzle's own migration bookkeeping lives in its
    // own schema, so public should hold exactly our 13.
    expect(tables).toHaveLength(13)
  })

  it('creates every expected enum', async () => {
    const rows = await t.sql<{ typname: string }[]>`
      SELECT typname FROM pg_type WHERE typtype = 'e' ORDER BY typname
    `
    expect(rows.map((r) => r.typname)).toEqual([
      'asset_source',
      'storage_driver',
      'wishlist_priority',
    ])
  })

  it('installs the pg_trgm extension', async () => {
    const rows = await t.sql<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'
    `
    expect(rows).toHaveLength(1)
  })

  it('creates the hand-written indexes drizzle-kit cannot express', async () => {
    const rows = await t.sql<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
    `
    const byName = new Map(rows.map((r) => [r.indexname, r.indexdef]))

    // Partial unique indexes — the duplicate-purchase guard.
    expect(byName.get('games_user_igdb_uniq')).toMatch(/UNIQUE/)
    expect(byName.get('games_user_igdb_uniq')).toMatch(/WHERE \(igdb_id IS NOT NULL\)/)
    expect(byName.get('wishlist_user_igdb_uniq')).toMatch(/WHERE \(igdb_id IS NOT NULL\)/)

    // Trigram indexes — the name filter.
    expect(byName.get('games_name_trgm_idx')).toMatch(/gin/)
    expect(byName.get('games_name_trgm_idx')).toMatch(/gin_trgm_ops/)
    expect(byName.get('wishlist_name_trgm_idx')).toMatch(/gin_trgm_ops/)
  })

  it('creates the filter-supporting btree indexes', async () => {
    const rows = await t.sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
    `
    const names = rows.map((r) => r.indexname)

    expect(names).toEqual(
      expect.arrayContaining([
        'games_user_sort_name_idx',
        'games_user_type_idx',
        'game_locations_location_idx',
        'game_genres_genre_idx',
        'locations_user_slug_uniq',
        'game_types_user_slug_uniq',
        'genres_user_slug_uniq',
      ]),
    )
  })

  it('is idempotent — re-running applies nothing and does not fail', async () => {
    const { runMigrations } = await import('../src/migrate.js')
    await expect(runMigrations(t.url)).resolves.toBeUndefined()
  })
})

describe('schema guarantees', () => {
  it('generates sort_name by stripping one leading article', async () => {
    const userId = await createUser(`sortname-${newId()}@example.com`)

    await t.sql`
      INSERT INTO games (id, user_id, name) VALUES
        (${newId()}, ${userId}, ${'The Witcher 3'}),
        (${newId()}, ${userId}, ${'A Plague Tale'}),
        (${newId()}, ${userId}, ${'Anno 1800'})
    `

    const rows = await t.sql<{ name: string; sort_name: string }[]>`
      SELECT name, sort_name FROM games WHERE user_id = ${userId} ORDER BY sort_name
    `

    expect(rows).toEqual([
      { name: 'Anno 1800', sort_name: 'Anno 1800' },
      { name: 'A Plague Tale', sort_name: 'Plague Tale' },
      { name: 'The Witcher 3', sort_name: 'Witcher 3' },
    ])
  })

  it('blocks the same IGDB title twice for one user', async () => {
    const userId = await createUser(`dupe-${newId()}@example.com`)

    await t.sql`INSERT INTO games (id, user_id, name, igdb_id) VALUES (${newId()}, ${userId}, ${'The Witcher 3'}, 1942)`

    await expect(
      t.sql`INSERT INTO games (id, user_id, name, igdb_id) VALUES (${newId()}, ${userId}, ${'Witcher 3 again'}, 1942)`,
    ).rejects.toThrow(/games_user_igdb_uniq/)
  })

  it('allows the same IGDB title for two different users', async () => {
    const a = await createUser(`a-${newId()}@example.com`)
    const b = await createUser(`b-${newId()}@example.com`)

    await t.sql`INSERT INTO games (id, user_id, name, igdb_id) VALUES (${newId()}, ${a}, ${'Hades'}, 113112)`
    await expect(
      t.sql`INSERT INTO games (id, user_id, name, igdb_id) VALUES (${newId()}, ${b}, ${'Hades'}, 113112)`,
    ).resolves.toBeDefined()
  })

  it('still allows many manual games with no IGDB id', async () => {
    const userId = await createUser(`manual-${newId()}@example.com`)

    await t.sql`
      INSERT INTO games (id, user_id, name) VALUES
        (${newId()}, ${userId}, ${'Homebrew A'}),
        (${newId()}, ${userId}, ${'Homebrew B'}),
        (${newId()}, ${userId}, ${'Homebrew C'})
    `

    const rows = await t.sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM games WHERE user_id = ${userId} AND igdb_id IS NULL
    `
    expect(rows[0]?.count).toBe('3')
  })

  it('rejects a malformed location colour', async () => {
    const userId = await createUser(`colour-${newId()}@example.com`)

    await expect(
      t.sql`INSERT INTO locations (id, user_id, name, slug, color) VALUES (${newId()}, ${userId}, ${'Bad'}, ${'bad'}, ${'red'})`,
    ).rejects.toThrow(/locations_color_hex_chk/)

    await expect(
      t.sql`INSERT INTO locations (id, user_id, name, slug, color) VALUES (${newId()}, ${userId}, ${'GOG'}, ${'gog'}, ${'#7B4FBF'})`,
    ).resolves.toBeDefined()
  })

  it('scopes slug uniqueness to the user, not globally', async () => {
    const a = await createUser(`slug-a-${newId()}@example.com`)
    const b = await createUser(`slug-b-${newId()}@example.com`)

    await t.sql`INSERT INTO locations (id, user_id, name, slug, color) VALUES (${newId()}, ${a}, ${'Steam'}, ${'steam'}, ${'#1B2838'})`
    // Same slug, different user — must be allowed.
    await expect(
      t.sql`INSERT INTO locations (id, user_id, name, slug, color) VALUES (${newId()}, ${b}, ${'Steam'}, ${'steam'}, ${'#1B2838'})`,
    ).resolves.toBeDefined()
    // Same slug, same user — must not.
    await expect(
      t.sql`INSERT INTO locations (id, user_id, name, slug, color) VALUES (${newId()}, ${a}, ${'Steam dup'}, ${'steam'}, ${'#1B2838'})`,
    ).rejects.toThrow(/locations_user_slug_uniq/)
  })

  it('lets one game sit in several locations at once', async () => {
    const userId = await createUser(`multiloc-${newId()}@example.com`)
    const gameId = newId()
    const gogId = newId()
    const driveId = newId()

    await t.sql`INSERT INTO games (id, user_id, name) VALUES (${gameId}, ${userId}, ${'Cyberpunk 2077'})`
    await t.sql`INSERT INTO locations (id, user_id, name, slug, color) VALUES (${gogId}, ${userId}, ${'GOG'}, ${'gog'}, ${'#7B4FBF'})`
    await t.sql`INSERT INTO locations (id, user_id, name, slug, color) VALUES (${driveId}, ${userId}, ${'WD 4TB'}, ${'wd-4tb'}, ${'#2F9BFF'})`
    await t.sql`INSERT INTO game_locations (game_id, location_id) VALUES (${gameId}, ${gogId}), (${gameId}, ${driveId})`

    const rows = await t.sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM game_locations WHERE game_id = ${gameId}
    `
    expect(rows[0]?.count).toBe('2')
  })

  it('cascades a user deletion through every owned table', async () => {
    const userId = await createUser(`cascade-${newId()}@example.com`)
    const gameId = newId()
    const locationId = newId()

    await t.sql`INSERT INTO games (id, user_id, name) VALUES (${gameId}, ${userId}, ${'Doomed'})`
    await t.sql`INSERT INTO locations (id, user_id, name, slug, color) VALUES (${locationId}, ${userId}, ${'Drive'}, ${'drive'}, ${'#123456'})`
    await t.sql`INSERT INTO game_locations (game_id, location_id) VALUES (${gameId}, ${locationId})`
    await t.sql`INSERT INTO wishlist_items (id, user_id, name) VALUES (${newId()}, ${userId}, ${'Wanted'})`

    await t.sql`DELETE FROM "user" WHERE id = ${userId}`

    for (const table of ['games', 'locations', 'wishlist_items'] as const) {
      const rows = await t.sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM ${t.sql(table)} WHERE user_id = ${userId}
      `
      expect(rows[0]?.count, `${table} should be empty after cascade`).toBe('0')
    }

    const links = await t.sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM game_locations WHERE game_id = ${gameId}
    `
    expect(links[0]?.count).toBe('0')
  })

  it('keeps a game when its game type is deleted (SET NULL, not cascade)', async () => {
    const userId = await createUser(`settnull-${newId()}@example.com`)
    const typeId = newId()
    const gameId = newId()

    await t.sql`INSERT INTO game_types (id, user_id, name, slug, is_default) VALUES (${typeId}, ${userId}, ${'Digital'}, ${'digital'}, true)`
    await t.sql`INSERT INTO games (id, user_id, name, game_type_id) VALUES (${gameId}, ${userId}, ${'Keeper'}, ${typeId})`

    await t.sql`DELETE FROM game_types WHERE id = ${typeId}`

    const rows = await t.sql<{ game_type_id: string | null }[]>`
      SELECT game_type_id FROM games WHERE id = ${gameId}
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]?.game_type_id).toBeNull()
  })
})
