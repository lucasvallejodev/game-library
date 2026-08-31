import { type Database, schema } from '@game-library/db'
import { and, asc, count, desc, eq, exists, ilike, inArray, sql, type SQL } from 'drizzle-orm'

export interface GameFilters {
  q?: string | undefined
  locationIds: string[]
  gameTypeIds: string[]
  genreIds: string[]
  sort: string
  page: number
  perPage: number
}

export interface GameRow {
  id: string
  name: string
  sortName: string
  igdbId: number | null
  summary: string | null
  releaseDate: string | null
  igdbRating: string | null
  notes: string | null
  acquiredAt: string | null
  gameTypeId: string | null
  coverAssetId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface GameTypeRef {
  id: string
  name: string
}

export interface LocationChip {
  gameId: string
  id: string
  name: string
  color: string
}

export interface GenreChip {
  gameId: string
  id: string
  name: string
}

export interface GameLinks {
  gameTypes: Map<string, GameTypeRef>
  locations: Map<string, LocationChip[]>
  genres: Map<string, GenreChip[]>
}

export interface GamesRepository {
  list: (userId: string, filters: GameFilters) => Promise<{ rows: GameRow[]; total: number }>
  findById: (userId: string, id: string) => Promise<GameRow | null>
  findByIgdbId: (userId: string, igdbId: number) => Promise<{ id: string; name: string } | null>
  /** Batch-load chips for a page of games, so the grid is 3 queries, not 3N. */
  loadLinks: (userId: string, gameIds: string[]) => Promise<GameLinks>
  insert: (userId: string, values: InsertGame) => Promise<string>
  update: (userId: string, id: string, values: UpdateGame) => Promise<boolean>
  remove: (userId: string, id: string) => Promise<boolean>
  setCover: (userId: string, id: string, assetId: string | null) => Promise<boolean>
  replaceLocations: (userId: string, gameId: string, locationIds: string[]) => Promise<void>
  replaceGenres: (userId: string, gameId: string, genreIds: string[]) => Promise<void>
  /** Ownership guard for referenced ids — see the note in the service. */
  countOwned: (
    userId: string,
    table: 'locations' | 'genres' | 'gameTypes',
    ids: string[],
  ) => Promise<number>
}

export interface InsertGame {
  name: string
  igdbId?: number | null
  gameTypeId?: string | null
  summary?: string | null
  releaseDate?: string | null
  notes?: string | null
  acquiredAt?: string | null
}

export type UpdateGame = Partial<InsertGame>

/** `%` and `_` are LIKE wildcards; a user searching for "50_off" means it literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export function createGamesRepository(db: Database): GamesRepository {
  const { games, gameLocations, gameGenres, locations, genres, gameTypes } = schema

  const columns = {
    id: games.id,
    name: games.name,
    sortName: games.sortName,
    igdbId: games.igdbId,
    summary: games.summary,
    releaseDate: games.releaseDate,
    igdbRating: games.igdbRating,
    notes: games.notes,
    acquiredAt: games.acquiredAt,
    gameTypeId: games.gameTypeId,
    coverAssetId: games.coverAssetId,
    createdAt: games.createdAt,
    updatedAt: games.updatedAt,
  }

  /**
   * Build the WHERE clause from whichever filters are present.
   *
   * `and()` ignores `undefined`, so an unset filter simply vanishes — this is
   * the composability that made Drizzle the right choice (docs/adr.md ADR-001).
   *
   * Location and genre use EXISTS rather than a JOIN: a game sitting in three
   * locations would be returned three times by a join, and DISTINCT would then
   * fight the ORDER BY. EXISTS asks the only question that matters — "is there
   * at least one matching link?" — and returns each game once.
   */
  function buildWhere(userId: string, filters: GameFilters): SQL | undefined {
    return and(
      eq(games.userId, userId),
      filters.q ? ilike(games.name, `%${escapeLike(filters.q)}%`) : undefined,
      filters.gameTypeIds.length > 0 ? inArray(games.gameTypeId, filters.gameTypeIds) : undefined,
      filters.locationIds.length > 0
        ? exists(
            db
              .select({ one: sql`1` })
              .from(gameLocations)
              .where(
                and(
                  eq(gameLocations.gameId, games.id),
                  inArray(gameLocations.locationId, filters.locationIds),
                ),
              ),
          )
        : undefined,
      filters.genreIds.length > 0
        ? exists(
            db
              .select({ one: sql`1` })
              .from(gameGenres)
              .where(
                and(eq(gameGenres.gameId, games.id), inArray(gameGenres.genreId, filters.genreIds)),
              ),
          )
        : undefined,
    )
  }

  function buildOrder(sort: string): SQL[] {
    switch (sort) {
      case '-name':
        return [desc(games.sortName)]
      case 'createdAt':
        return [asc(games.createdAt)]
      case '-createdAt':
        return [desc(games.createdAt)]
      case 'releaseDate':
        return [asc(games.releaseDate)]
      case '-releaseDate':
        return [desc(games.releaseDate)]
      case 'rating':
        return [asc(games.igdbRating)]
      case '-rating':
        return [desc(games.igdbRating)]
      default:
        return [asc(games.sortName)]
    }
  }

  return {
    list: async (userId, filters) => {
      const where = buildWhere(userId, filters)

      const [rows, totals] = await Promise.all([
        db
          .select(columns)
          .from(games)
          .where(where)
          .orderBy(...buildOrder(filters.sort), asc(games.id))
          .limit(filters.perPage)
          .offset((filters.page - 1) * filters.perPage),
        db.select({ value: count() }).from(games).where(where),
      ])

      return { rows, total: totals[0]?.value ?? 0 }
    },

    findById: async (userId, id) => {
      const rows = await db
        .select(columns)
        .from(games)
        .where(and(eq(games.userId, userId), eq(games.id, id)))
      return rows[0] ?? null
    },

    findByIgdbId: async (userId, igdbId) => {
      const rows = await db
        .select({ id: games.id, name: games.name })
        .from(games)
        .where(and(eq(games.userId, userId), eq(games.igdbId, igdbId)))
      return rows[0] ?? null
    },

    loadLinks: async (userId, gameIds) => {
      if (gameIds.length === 0) {
        return { gameTypes: new Map(), locations: new Map(), genres: new Map() }
      }

      const [typeRows, locationRows, genreRows] = await Promise.all([
        db
          .select({ id: gameTypes.id, name: gameTypes.name })
          .from(gameTypes)
          .where(eq(gameTypes.userId, userId)),
        db
          .select({
            gameId: gameLocations.gameId,
            id: locations.id,
            name: locations.name,
            color: locations.color,
          })
          .from(gameLocations)
          .innerJoin(locations, eq(locations.id, gameLocations.locationId))
          .where(inArray(gameLocations.gameId, gameIds))
          .orderBy(asc(locations.sortOrder), asc(locations.name)),
        db
          .select({ gameId: gameGenres.gameId, id: genres.id, name: genres.name })
          .from(gameGenres)
          .innerJoin(genres, eq(genres.id, gameGenres.genreId))
          .where(inArray(gameGenres.gameId, gameIds))
          .orderBy(asc(genres.name)),
      ])

      const byGame = <T extends { gameId: string }>(rows: T[]): Map<string, T[]> => {
        const map = new Map<string, T[]>()
        for (const row of rows) {
          const list = map.get(row.gameId)
          if (list) list.push(row)
          else map.set(row.gameId, [row])
        }
        return map
      }

      return {
        gameTypes: new Map(typeRows.map((t) => [t.id, t])),
        locations: byGame(locationRows),
        genres: byGame(genreRows),
      }
    },

    insert: async (userId, values) => {
      const rows = await db
        .insert(games)
        .values({ userId, ...values })
        .returning({ id: games.id })
      const id = rows[0]?.id
      if (!id) throw new Error('game insert returned no id')
      return id
    },

    update: async (userId, id, values) => {
      const rows = await db
        .update(games)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(games.userId, userId), eq(games.id, id)))
        .returning({ id: games.id })
      return rows.length > 0
    },

    remove: async (userId, id) => {
      const rows = await db
        .delete(games)
        .where(and(eq(games.userId, userId), eq(games.id, id)))
        .returning({ id: games.id })
      return rows.length > 0
    },

    setCover: async (userId, id, assetId) => {
      const rows = await db
        .update(games)
        .set({ coverAssetId: assetId, updatedAt: new Date() })
        .where(and(eq(games.userId, userId), eq(games.id, id)))
        .returning({ id: games.id })
      return rows.length > 0
    },

    /**
     * Both replace methods re-verify game ownership *inside* their transaction
     * rather than trusting the caller. The service already checks, but a
     * repository method that rewrites link rows for any game id — regardless
     * of owner — is exactly the unscoped write AGENTS.md rule 1 forbids.
     */
    replaceLocations: async (userId, gameId, locationIds) => {
      await db.transaction(async (tx) => {
        const owned = await tx
          .select({ id: games.id })
          .from(games)
          .where(and(eq(games.id, gameId), eq(games.userId, userId)))
        if (owned.length === 0) return

        await tx.delete(gameLocations).where(eq(gameLocations.gameId, gameId))
        if (locationIds.length > 0) {
          await tx
            .insert(gameLocations)
            .values(locationIds.map((locationId) => ({ gameId, locationId })))
        }
      })
    },

    replaceGenres: async (userId, gameId, genreIds) => {
      await db.transaction(async (tx) => {
        const owned = await tx
          .select({ id: games.id })
          .from(games)
          .where(and(eq(games.id, gameId), eq(games.userId, userId)))
        if (owned.length === 0) return

        await tx.delete(gameGenres).where(eq(gameGenres.gameId, gameId))
        if (genreIds.length > 0) {
          await tx.insert(gameGenres).values(genreIds.map((genreId) => ({ gameId, genreId })))
        }
      })
    },

    countOwned: async (userId, table, ids) => {
      if (ids.length === 0) return 0
      const target = table === 'locations' ? locations : table === 'genres' ? genres : gameTypes
      const rows = await db
        .select({ value: count() })
        .from(target)
        .where(and(eq(target.userId, userId), inArray(target.id, ids)))
      return rows[0]?.value ?? 0
    },
  }
}
