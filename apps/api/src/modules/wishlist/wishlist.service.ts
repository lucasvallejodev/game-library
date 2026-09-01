import { type Database, schema } from '@game-library/db'
import type {
  CreateWishlistItemInput,
  DuplicateCheck,
  UpdateWishlistItemInput,
  WishlistItem,
  WishlistList,
} from '@game-library/shared/schemas'
import { and, eq } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'

import { ConflictError, NotFoundError, ValidationError } from '../../errors.js'
import type { IgdbService } from '../igdb/igdb.service.js'
import type { MediaService } from '../media/media.service.js'
import { resolveGenreIds } from '../games/igdb-import.js'
import type { WishlistRepository, WishlistRow } from './wishlist.repository.js'

export interface WishlistQuery {
  q?: string | undefined
  gameTypeId: string[]
  genreId: string[]
  priority: ('low' | 'medium' | 'high')[]
  sort: string
  page: number
  perPage: number
}

export interface WishlistService {
  list: (userId: string, query: WishlistQuery) => Promise<WishlistList>
  get: (userId: string, id: string) => Promise<WishlistItem>
  create: (userId: string, input: CreateWishlistItemInput) => Promise<WishlistItem>
  update: (userId: string, id: string, input: UpdateWishlistItemInput) => Promise<WishlistItem>
  remove: (userId: string, id: string) => Promise<void>
  setCover: (userId: string, id: string, assetId: string) => Promise<WishlistItem>
  promote: (
    userId: string,
    id: string,
    options: { locationIds: string[]; acquiredAt?: string | undefined },
  ) => Promise<{ gameId: string }>
  /** The duplicate-purchase guard. */
  checkDuplicate: (userId: string, igdbId: number) => Promise<DuplicateCheck>
}

export interface WishlistServiceDeps {
  repo: WishlistRepository
  db: Database
  log: FastifyBaseLogger
  igdb: IgdbService | null
  media: MediaService
}

export function createWishlistService(deps: WishlistServiceDeps): WishlistService {
  const { repo, db, log, igdb, media } = deps

  function toItem(
    row: WishlistRow,
    genres: { id: string; name: string }[],
    gameType: { id: string; name: string } | null,
  ): WishlistItem {
    return {
      id: row.id,
      name: row.name,
      sortName: row.sortName,
      igdbId: row.igdbId,
      summary: row.summary,
      releaseDate: row.releaseDate,
      coverUrl: row.coverAssetId ? `/api/media/${row.coverAssetId}/cover.webp` : null,
      thumbUrl: row.coverAssetId ? `/api/media/${row.coverAssetId}/thumb.webp` : null,
      gameType,
      genres,
      priority: row.priority,
      targetPrice: row.targetPrice,
      currency: row.currency,
      storeUrl: row.storeUrl,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  async function loadOne(userId: string, id: string): Promise<WishlistItem> {
    const row = await repo.findById(userId, id)
    if (!row) throw new NotFoundError('Wishlist item')

    const [genreMap, typeMap] = await Promise.all([
      repo.loadGenres(userId, [id]),
      repo.loadGameTypes(userId),
    ])

    return toItem(
      row,
      genreMap.get(id) ?? [],
      row.gameTypeId ? (typeMap.get(row.gameTypeId) ?? null) : null,
    )
  }

  /** Referenced taxonomy must belong to the acting user (docs/security.md §3). */
  async function assertOwnedGenres(userId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const unique = [...new Set(ids)]
    const rows = await db
      .select({ id: schema.genres.id })
      .from(schema.genres)
      .where(eq(schema.genres.userId, userId))
    const owned = new Set(rows.map((r) => r.id))
    if (unique.some((id) => !owned.has(id))) {
      throw new ValidationError('One or more genres do not exist')
    }
  }

  async function mirrorCover(userId: string, itemId: string, coverUrl: string | null) {
    if (!coverUrl) return
    try {
      const asset = await media.storeFromUrl(userId, coverUrl)
      await repo.setCover(userId, itemId, asset.id)
    } catch (error) {
      // A missing cover is cosmetic; a failed save is not.
      log.warn({ err: error, itemId }, 'failed to mirror IGDB cover for wishlist item')
    }
  }

  return {
    list: async (userId, query) => {
      const { rows, total } = await repo.list(userId, {
        q: query.q,
        gameTypeIds: query.gameTypeId,
        genreIds: query.genreId,
        priorities: query.priority,
        sort: query.sort,
        page: query.page,
        perPage: query.perPage,
      })

      const [genreMap, typeMap] = await Promise.all([
        repo.loadGenres(
          userId,
          rows.map((r) => r.id),
        ),
        repo.loadGameTypes(userId),
      ])

      return {
        data: rows.map((row) =>
          toItem(
            row,
            genreMap.get(row.id) ?? [],
            row.gameTypeId ? (typeMap.get(row.gameTypeId) ?? null) : null,
          ),
        ),
        meta: {
          page: query.page,
          perPage: query.perPage,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.perPage)),
        },
      }
    },

    get: async (userId, id) => loadOne(userId, id),

    create: async (userId, input) => {
      if (input.igdbId !== undefined) {
        // Wishlisting something you already own is exactly the mistake this
        // project exists to prevent, so say so plainly.
        const owned = await db
          .select({ id: schema.games.id, name: schema.games.name })
          .from(schema.games)
          .where(and(eq(schema.games.userId, userId), eq(schema.games.igdbId, input.igdbId)))

        if (owned[0]) {
          throw new ConflictError(`"${owned[0].name}" is already in your library`, {
            existingGameId: owned[0].id,
            existingGameName: owned[0].name,
            reason: 'owned',
          })
        }

        const wanted = await repo.findByIgdbId(userId, input.igdbId)
        if (wanted) {
          throw new ConflictError(`"${wanted.name}" is already on your wishlist`, {
            existingWishlistItemId: wanted.id,
            reason: 'wishlisted',
          })
        }
      }

      await assertOwnedGenres(userId, input.genreIds ?? [])

      const metadata =
        input.igdbId !== undefined && igdb ? await igdb.fetchForImport(input.igdbId) : null

      const id = await repo.insert(userId, {
        name: input.name ?? metadata?.name ?? 'Untitled',
        igdbId: input.igdbId ?? null,
        summary: metadata?.summary ?? null,
        releaseDate: metadata?.releaseDate ?? null,
        gameTypeId: input.gameTypeId ?? null,
        priority: input.priority ?? 'medium',
        targetPrice: input.targetPrice ?? null,
        currency: input.currency?.toUpperCase() ?? null,
        storeUrl: input.storeUrl ?? null,
        notes: input.notes ?? null,
      })

      if (input.genreIds) {
        await repo.replaceGenres(userId, id, input.genreIds)
      } else if (metadata && metadata.genres.length > 0) {
        await repo.replaceGenres(userId, id, await resolveGenreIds(db, userId, metadata.genres))
      }

      await mirrorCover(userId, id, metadata?.coverUrl ?? null)

      return loadOne(userId, id)
    },

    update: async (userId, id, input) => {
      const existing = await repo.findById(userId, id)
      if (!existing) throw new NotFoundError('Wishlist item')

      await assertOwnedGenres(userId, input.genreIds ?? [])

      const values: Parameters<WishlistRepository['update']>[2] = {}
      if (input.name !== undefined) values.name = input.name
      if (input.gameTypeId !== undefined) values.gameTypeId = input.gameTypeId
      if (input.priority !== undefined) values.priority = input.priority
      if (input.targetPrice !== undefined) values.targetPrice = input.targetPrice
      if (input.currency !== undefined) {
        values.currency = input.currency === null ? null : input.currency.toUpperCase()
      }
      if (input.storeUrl !== undefined) values.storeUrl = input.storeUrl
      if (input.notes !== undefined) values.notes = input.notes

      if (Object.keys(values).length > 0) await repo.update(userId, id, values)
      if (input.genreIds !== undefined) await repo.replaceGenres(userId, id, input.genreIds)

      return loadOne(userId, id)
    },

    remove: async (userId, id) => {
      const deleted = await repo.remove(userId, id)
      if (!deleted) throw new NotFoundError('Wishlist item')
    },

    setCover: async (userId, id, assetId) => {
      const updated = await repo.setCover(userId, id, assetId)
      if (!updated) throw new NotFoundError('Wishlist item')
      return loadOne(userId, id)
    },

    promote: async (userId, id, options) => {
      const gameId = await repo.promote(userId, id, options)
      if (!gameId) throw new NotFoundError('Wishlist item')
      return { gameId }
    },

    checkDuplicate: async (userId, igdbId) => {
      const [ownedRows, wanted] = await Promise.all([
        db
          .select({ id: schema.games.id, name: schema.games.name })
          .from(schema.games)
          .where(and(eq(schema.games.userId, userId), eq(schema.games.igdbId, igdbId))),
        repo.findByIgdbId(userId, igdbId),
      ])

      const owned = ownedRows[0] ?? null

      // Where it is matters as much as whether you have it: "on the external
      // drive" is the answer that stops a second purchase.
      const locations = owned
        ? await db
            .select({
              id: schema.locations.id,
              name: schema.locations.name,
              color: schema.locations.color,
            })
            .from(schema.gameLocations)
            .innerJoin(schema.locations, eq(schema.locations.id, schema.gameLocations.locationId))
            .where(eq(schema.gameLocations.gameId, owned.id))
        : []

      return {
        owned: owned !== null,
        game: owned ? { id: owned.id, name: owned.name, locations } : null,
        wishlisted: wanted !== null,
        wishlistItem: wanted ? { id: wanted.id, name: wanted.name } : null,
      }
    },
  }
}
