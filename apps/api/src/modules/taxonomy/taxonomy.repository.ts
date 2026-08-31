import { type Database, schema } from '@game-library/db'
import { and, asc, count, eq, sql } from 'drizzle-orm'

/**
 * Data access for locations, game types and genres.
 *
 * **Every method takes `userId` first.** The repository is created bound to a
 * database handle precisely so that `userId` can occupy the first parameter
 * slot of every operation — there is no signature here capable of an unscoped
 * read. That is the codebase's central invariant; see docs/security.md §3 and
 * AGENTS.md rule 1.
 *
 * Reviewers can check it mechanically: if a method's first argument is not
 * `userId`, it is wrong.
 */

export interface LocationRow {
  id: string
  name: string
  slug: string
  color: string
  sortOrder: number
  logoAssetId: string | null
  gameCount: number
  createdAt: Date
  updatedAt: Date
}

export interface GameTypeRow {
  id: string
  name: string
  slug: string
  isDefault: boolean
  gameCount: number
  createdAt: Date
  updatedAt: Date
}

export interface GenreRow {
  id: string
  name: string
  slug: string
  igdbId: number | null
  isDefault: boolean
  gameCount: number
  createdAt: Date
  updatedAt: Date
}

export interface TaxonomyRepository {
  locations: {
    list: (userId: string) => Promise<LocationRow[]>
    findById: (userId: string, id: string) => Promise<LocationRow | null>
    findBySlug: (userId: string, slug: string) => Promise<{ id: string } | null>
    insert: (
      userId: string,
      values: { name: string; slug: string; color: string; sortOrder: number },
    ) => Promise<string>
    update: (
      userId: string,
      id: string,
      values: Partial<{ name: string; slug: string; color: string; sortOrder: number }>,
    ) => Promise<boolean>
    remove: (userId: string, id: string) => Promise<boolean>
    setLogo: (userId: string, id: string, assetId: string | null) => Promise<boolean>
  }
  gameTypes: {
    list: (userId: string) => Promise<GameTypeRow[]>
    findById: (userId: string, id: string) => Promise<GameTypeRow | null>
    findBySlug: (userId: string, slug: string) => Promise<{ id: string } | null>
    insert: (userId: string, values: { name: string; slug: string }) => Promise<string>
    update: (
      userId: string,
      id: string,
      values: Partial<{ name: string; slug: string }>,
    ) => Promise<boolean>
    remove: (userId: string, id: string) => Promise<boolean>
  }
  genres: {
    list: (userId: string) => Promise<GenreRow[]>
    findById: (userId: string, id: string) => Promise<GenreRow | null>
    findBySlug: (userId: string, slug: string) => Promise<{ id: string } | null>
    insert: (userId: string, values: { name: string; slug: string }) => Promise<string>
    update: (
      userId: string,
      id: string,
      values: Partial<{ name: string; slug: string }>,
    ) => Promise<boolean>
    remove: (userId: string, id: string) => Promise<boolean>
  }
}

export function createTaxonomyRepository(db: Database): TaxonomyRepository {
  const { locations, gameTypes, genres, gameLocations, gameGenres, games } = schema

  /**
   * Counts come from correlated subqueries rather than LEFT JOIN + GROUP BY.
   * With three counts on one row a join would multiply rows before grouping;
   * the subquery keeps each count independent and the SQL readable.
   */
  const locationGameCount = db
    .select({ value: count() })
    .from(gameLocations)
    .where(eq(gameLocations.locationId, locations.id))

  const gameTypeGameCount = db
    .select({ value: count() })
    .from(games)
    .where(eq(games.gameTypeId, gameTypes.id))

  const genreGameCount = db
    .select({ value: count() })
    .from(gameGenres)
    .where(eq(gameGenres.genreId, genres.id))

  return {
    locations: {
      list: async (userId) =>
        db
          .select({
            id: locations.id,
            name: locations.name,
            slug: locations.slug,
            color: locations.color,
            sortOrder: locations.sortOrder,
            logoAssetId: locations.logoAssetId,
            gameCount: sql<number>`(${locationGameCount})::int`,
            createdAt: locations.createdAt,
            updatedAt: locations.updatedAt,
          })
          .from(locations)
          .where(eq(locations.userId, userId))
          .orderBy(asc(locations.sortOrder), asc(locations.name)),

      findById: async (userId, id) => {
        const rows = await db
          .select({
            id: locations.id,
            name: locations.name,
            slug: locations.slug,
            color: locations.color,
            sortOrder: locations.sortOrder,
            logoAssetId: locations.logoAssetId,
            gameCount: sql<number>`(${locationGameCount})::int`,
            createdAt: locations.createdAt,
            updatedAt: locations.updatedAt,
          })
          .from(locations)
          .where(and(eq(locations.userId, userId), eq(locations.id, id)))
        return rows[0] ?? null
      },

      findBySlug: async (userId, slug) => {
        const rows = await db
          .select({ id: locations.id })
          .from(locations)
          .where(and(eq(locations.userId, userId), eq(locations.slug, slug)))
        return rows[0] ?? null
      },

      insert: async (userId, values) => {
        const rows = await db
          .insert(locations)
          .values({ userId, ...values })
          .returning({ id: locations.id })
        const id = rows[0]?.id
        if (!id) throw new Error('insert returned no id')
        return id
      },

      update: async (userId, id, values) => {
        const rows = await db
          .update(locations)
          .set({ ...values, updatedAt: new Date() })
          .where(and(eq(locations.userId, userId), eq(locations.id, id)))
          .returning({ id: locations.id })
        return rows.length > 0
      },

      remove: async (userId, id) => {
        const rows = await db
          .delete(locations)
          .where(and(eq(locations.userId, userId), eq(locations.id, id)))
          .returning({ id: locations.id })
        return rows.length > 0
      },

      setLogo: async (userId, id, assetId) => {
        const rows = await db
          .update(locations)
          .set({ logoAssetId: assetId, updatedAt: new Date() })
          .where(and(eq(locations.userId, userId), eq(locations.id, id)))
          .returning({ id: locations.id })
        return rows.length > 0
      },
    },

    gameTypes: {
      list: async (userId) =>
        db
          .select({
            id: gameTypes.id,
            name: gameTypes.name,
            slug: gameTypes.slug,
            isDefault: gameTypes.isDefault,
            gameCount: sql<number>`(${gameTypeGameCount})::int`,
            createdAt: gameTypes.createdAt,
            updatedAt: gameTypes.updatedAt,
          })
          .from(gameTypes)
          .where(eq(gameTypes.userId, userId))
          .orderBy(asc(gameTypes.name)),

      findById: async (userId, id) => {
        const rows = await db
          .select({
            id: gameTypes.id,
            name: gameTypes.name,
            slug: gameTypes.slug,
            isDefault: gameTypes.isDefault,
            gameCount: sql<number>`(${gameTypeGameCount})::int`,
            createdAt: gameTypes.createdAt,
            updatedAt: gameTypes.updatedAt,
          })
          .from(gameTypes)
          .where(and(eq(gameTypes.userId, userId), eq(gameTypes.id, id)))
        return rows[0] ?? null
      },

      findBySlug: async (userId, slug) => {
        const rows = await db
          .select({ id: gameTypes.id })
          .from(gameTypes)
          .where(and(eq(gameTypes.userId, userId), eq(gameTypes.slug, slug)))
        return rows[0] ?? null
      },

      insert: async (userId, values) => {
        const rows = await db
          .insert(gameTypes)
          .values({ userId, ...values })
          .returning({ id: gameTypes.id })
        const id = rows[0]?.id
        if (!id) throw new Error('insert returned no id')
        return id
      },

      update: async (userId, id, values) => {
        const rows = await db
          .update(gameTypes)
          .set({ ...values, updatedAt: new Date() })
          .where(and(eq(gameTypes.userId, userId), eq(gameTypes.id, id)))
          .returning({ id: gameTypes.id })
        return rows.length > 0
      },

      remove: async (userId, id) => {
        const rows = await db
          .delete(gameTypes)
          .where(and(eq(gameTypes.userId, userId), eq(gameTypes.id, id)))
          .returning({ id: gameTypes.id })
        return rows.length > 0
      },
    },

    genres: {
      list: async (userId) =>
        db
          .select({
            id: genres.id,
            name: genres.name,
            slug: genres.slug,
            igdbId: genres.igdbId,
            isDefault: genres.isDefault,
            gameCount: sql<number>`(${genreGameCount})::int`,
            createdAt: genres.createdAt,
            updatedAt: genres.updatedAt,
          })
          .from(genres)
          .where(eq(genres.userId, userId))
          .orderBy(asc(genres.name)),

      findById: async (userId, id) => {
        const rows = await db
          .select({
            id: genres.id,
            name: genres.name,
            slug: genres.slug,
            igdbId: genres.igdbId,
            isDefault: genres.isDefault,
            gameCount: sql<number>`(${genreGameCount})::int`,
            createdAt: genres.createdAt,
            updatedAt: genres.updatedAt,
          })
          .from(genres)
          .where(and(eq(genres.userId, userId), eq(genres.id, id)))
        return rows[0] ?? null
      },

      findBySlug: async (userId, slug) => {
        const rows = await db
          .select({ id: genres.id })
          .from(genres)
          .where(and(eq(genres.userId, userId), eq(genres.slug, slug)))
        return rows[0] ?? null
      },

      insert: async (userId, values) => {
        const rows = await db
          .insert(genres)
          .values({ userId, ...values })
          .returning({ id: genres.id })
        const id = rows[0]?.id
        if (!id) throw new Error('insert returned no id')
        return id
      },

      update: async (userId, id, values) => {
        const rows = await db
          .update(genres)
          .set({ ...values, updatedAt: new Date() })
          .where(and(eq(genres.userId, userId), eq(genres.id, id)))
          .returning({ id: genres.id })
        return rows.length > 0
      },

      remove: async (userId, id) => {
        const rows = await db
          .delete(genres)
          .where(and(eq(genres.userId, userId), eq(genres.id, id)))
          .returning({ id: genres.id })
        return rows.length > 0
      },
    },
  }
}
