import { type Database, schema } from '@game-library/db'
import { and, asc, count, desc, eq, ilike, inArray, sql, type SQL } from 'drizzle-orm'

export interface WishlistFilters {
  q?: string | undefined
  gameTypeIds: string[]
  genreIds: string[]
  priorities: ('low' | 'medium' | 'high')[]
  sort: string
  page: number
  perPage: number
}

export interface WishlistRow {
  id: string
  name: string
  sortName: string
  igdbId: number | null
  summary: string | null
  releaseDate: string | null
  coverAssetId: string | null
  gameTypeId: string | null
  priority: 'low' | 'medium' | 'high'
  targetPrice: string | null
  currency: string | null
  storeUrl: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export interface InsertWishlistItem {
  name: string
  igdbId?: number | null
  summary?: string | null
  releaseDate?: string | null
  gameTypeId?: string | null
  priority?: 'low' | 'medium' | 'high'
  targetPrice?: string | null
  currency?: string | null
  storeUrl?: string | null
  notes?: string | null
}

export interface WishlistRepository {
  list: (
    userId: string,
    filters: WishlistFilters,
  ) => Promise<{ rows: WishlistRow[]; total: number }>
  findById: (userId: string, id: string) => Promise<WishlistRow | null>
  findByIgdbId: (userId: string, igdbId: number) => Promise<{ id: string; name: string } | null>
  loadGenres: (
    userId: string,
    itemIds: string[],
  ) => Promise<Map<string, { id: string; name: string }[]>>
  loadGameTypes: (userId: string) => Promise<Map<string, { id: string; name: string }>>
  insert: (userId: string, values: InsertWishlistItem) => Promise<string>
  update: (userId: string, id: string, values: Partial<InsertWishlistItem>) => Promise<boolean>
  remove: (userId: string, id: string) => Promise<boolean>
  setCover: (userId: string, id: string, assetId: string | null) => Promise<boolean>
  replaceGenres: (userId: string, itemId: string, genreIds: string[]) => Promise<void>
  /** Move an item into the library in one transaction. */
  promote: (
    userId: string,
    id: string,
    options: { locationIds: string[]; acquiredAt?: string | undefined },
  ) => Promise<string | null>
}

/** `%` and `_` are LIKE wildcards; a literal search must not use them as such. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** `userId` first on every method — see AGENTS.md rule 1. */
export function createWishlistRepository(db: Database): WishlistRepository {
  const { wishlistItems, wishlistItemGenres, genres, gameTypes, games, gameLocations, gameGenres } =
    schema

  const columns = {
    id: wishlistItems.id,
    name: wishlistItems.name,
    sortName: wishlistItems.sortName,
    igdbId: wishlistItems.igdbId,
    summary: wishlistItems.summary,
    releaseDate: wishlistItems.releaseDate,
    coverAssetId: wishlistItems.coverAssetId,
    gameTypeId: wishlistItems.gameTypeId,
    priority: wishlistItems.priority,
    targetPrice: wishlistItems.targetPrice,
    currency: wishlistItems.currency,
    storeUrl: wishlistItems.storeUrl,
    notes: wishlistItems.notes,
    createdAt: wishlistItems.createdAt,
    updatedAt: wishlistItems.updatedAt,
  }

  function buildWhere(userId: string, filters: WishlistFilters): SQL | undefined {
    return and(
      eq(wishlistItems.userId, userId),
      filters.q ? ilike(wishlistItems.name, `%${escapeLike(filters.q)}%`) : undefined,
      filters.gameTypeIds.length > 0
        ? inArray(wishlistItems.gameTypeId, filters.gameTypeIds)
        : undefined,
      filters.priorities.length > 0
        ? inArray(wishlistItems.priority, filters.priorities)
        : undefined,
      // EXISTS, not JOIN: an item with three genres must appear once.
      filters.genreIds.length > 0
        ? sql`EXISTS (SELECT 1 FROM ${wishlistItemGenres}
              WHERE ${wishlistItemGenres.wishlistItemId} = ${wishlistItems.id}
              AND ${wishlistItemGenres.genreId} IN ${filters.genreIds})`
        : undefined,
    )
  }

  function buildOrder(sort: string): SQL[] {
    switch (sort) {
      case '-name':
        return [desc(wishlistItems.sortName)]
      case 'createdAt':
        return [asc(wishlistItems.createdAt)]
      case '-createdAt':
        return [desc(wishlistItems.createdAt)]
      // Postgres orders an enum by its declaration order (low, medium, high),
      // so descending genuinely means "most wanted first".
      case 'priority':
        return [asc(wishlistItems.priority)]
      case '-priority':
        return [desc(wishlistItems.priority)]
      case 'targetPrice':
        return [asc(wishlistItems.targetPrice)]
      default:
        return [asc(wishlistItems.sortName)]
    }
  }

  return {
    list: async (userId, filters) => {
      const where = buildWhere(userId, filters)

      const [rows, totals] = await Promise.all([
        db
          .select(columns)
          .from(wishlistItems)
          .where(where)
          .orderBy(...buildOrder(filters.sort), asc(wishlistItems.id))
          .limit(filters.perPage)
          .offset((filters.page - 1) * filters.perPage),
        db.select({ value: count() }).from(wishlistItems).where(where),
      ])

      return { rows, total: totals[0]?.value ?? 0 }
    },

    findById: async (userId, id) => {
      const rows = await db
        .select(columns)
        .from(wishlistItems)
        .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.id, id)))
      return rows[0] ?? null
    },

    findByIgdbId: async (userId, igdbId) => {
      const rows = await db
        .select({ id: wishlistItems.id, name: wishlistItems.name })
        .from(wishlistItems)
        .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.igdbId, igdbId)))
      return rows[0] ?? null
    },

    loadGenres: async (userId, itemIds) => {
      const map = new Map<string, { id: string; name: string }[]>()
      if (itemIds.length === 0) return map

      // Joined back to wishlist_items and scoped by user: a repository method
      // must not be able to read link rows for someone else's item, even when
      // the caller happens to pass ids it owns. See AGENTS.md rule 1.
      const rows = await db
        .select({
          itemId: wishlistItemGenres.wishlistItemId,
          id: genres.id,
          name: genres.name,
        })
        .from(wishlistItemGenres)
        .innerJoin(genres, eq(genres.id, wishlistItemGenres.genreId))
        .innerJoin(wishlistItems, eq(wishlistItems.id, wishlistItemGenres.wishlistItemId))
        .where(
          and(
            eq(wishlistItems.userId, userId),
            inArray(wishlistItemGenres.wishlistItemId, itemIds),
          ),
        )
        .orderBy(asc(genres.name))

      for (const row of rows) {
        const list = map.get(row.itemId)
        if (list) list.push({ id: row.id, name: row.name })
        else map.set(row.itemId, [{ id: row.id, name: row.name }])
      }
      return map
    },

    loadGameTypes: async (userId) => {
      const rows = await db
        .select({ id: gameTypes.id, name: gameTypes.name })
        .from(gameTypes)
        .where(eq(gameTypes.userId, userId))
      return new Map(rows.map((r) => [r.id, r]))
    },

    insert: async (userId, values) => {
      const rows = await db
        .insert(wishlistItems)
        .values({ userId, ...values })
        .returning({ id: wishlistItems.id })
      const id = rows[0]?.id
      if (!id) throw new Error('wishlist insert returned no id')
      return id
    },

    update: async (userId, id, values) => {
      const rows = await db
        .update(wishlistItems)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.id, id)))
        .returning({ id: wishlistItems.id })
      return rows.length > 0
    },

    remove: async (userId, id) => {
      const rows = await db
        .delete(wishlistItems)
        .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.id, id)))
        .returning({ id: wishlistItems.id })
      return rows.length > 0
    },

    setCover: async (userId, id, assetId) => {
      const rows = await db
        .update(wishlistItems)
        .set({ coverAssetId: assetId, updatedAt: new Date() })
        .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.id, id)))
        .returning({ id: wishlistItems.id })
      return rows.length > 0
    },

    replaceGenres: async (userId, itemId, genreIds) => {
      await db.transaction(async (tx) => {
        // Re-verify ownership inside the transaction rather than trusting the
        // caller — see AGENTS.md rule 1.
        const owned = await tx
          .select({ id: wishlistItems.id })
          .from(wishlistItems)
          .where(and(eq(wishlistItems.id, itemId), eq(wishlistItems.userId, userId)))
        if (owned.length === 0) return

        await tx.delete(wishlistItemGenres).where(eq(wishlistItemGenres.wishlistItemId, itemId))
        if (genreIds.length > 0) {
          await tx
            .insert(wishlistItemGenres)
            .values(genreIds.map((genreId) => ({ wishlistItemId: itemId, genreId })))
        }
      })
    },

    /**
     * Bought it.
     *
     * One transaction: create the game, move the cover asset and genres across,
     * record provenance on the wishlist row, then delete it. A partial promote
     * would either lose the wishlist entry or duplicate the game.
     */
    promote: async (userId, id, options) => {
      return db.transaction(async (tx) => {
        const items = await tx
          .select(columns)
          .from(wishlistItems)
          .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.id, id)))

        const item = items[0]
        if (!item) return null

        // The library's own duplicate guard still applies.
        if (item.igdbId !== null) {
          const clash = await tx
            .select({ id: games.id })
            .from(games)
            .where(and(eq(games.userId, userId), eq(games.igdbId, item.igdbId)))
          if (clash[0]) return clash[0].id
        }

        const created = await tx
          .insert(games)
          .values({
            userId,
            name: item.name,
            igdbId: item.igdbId,
            summary: item.summary,
            releaseDate: item.releaseDate,
            gameTypeId: item.gameTypeId,
            // The cover moves with it; re-mirroring would waste a fetch.
            coverAssetId: item.coverAssetId,
            notes: item.notes,
            ...(options.acquiredAt ? { acquiredAt: options.acquiredAt } : {}),
          })
          .returning({ id: games.id })

        const gameId = created[0]?.id
        if (!gameId) throw new Error('promote produced no game')

        if (options.locationIds.length > 0) {
          await tx
            .insert(gameLocations)
            .values(options.locationIds.map((locationId) => ({ gameId, locationId })))
        }

        const genreRows = await tx
          .select({ genreId: wishlistItemGenres.genreId })
          .from(wishlistItemGenres)
          .where(eq(wishlistItemGenres.wishlistItemId, id))

        if (genreRows.length > 0) {
          await tx.insert(gameGenres).values(genreRows.map((g) => ({ gameId, genreId: g.genreId })))
        }

        await tx.delete(wishlistItems).where(eq(wishlistItems.id, id))

        return gameId
      })
    },
  }
}
