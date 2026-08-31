import type {
  CreateGameInput,
  GameCard,
  GameDetail,
  GameList,
  GameListQuery,
  UpdateGameInput,
} from '@game-library/shared/schemas'

import { ConflictError, NotFoundError, ValidationError } from '../../errors.js'
import type { GameLinks, GameRow, GamesRepository } from './games.repository.js'

export interface GamesService {
  list: (userId: string, query: GameListQuery) => Promise<GameList>
  get: (userId: string, id: string) => Promise<GameDetail>
  create: (userId: string, input: CreateGameInput) => Promise<GameDetail>
  update: (userId: string, id: string, input: UpdateGameInput) => Promise<GameDetail>
  remove: (userId: string, id: string) => Promise<void>
  setCover: (userId: string, id: string, assetId: string) => Promise<GameDetail>
}

function coverUrls(assetId: string | null): { coverUrl: string | null; thumbUrl: string | null } {
  if (!assetId) return { coverUrl: null, thumbUrl: null }
  return {
    coverUrl: `/api/media/${assetId}/cover.webp`,
    thumbUrl: `/api/media/${assetId}/thumb.webp`,
  }
}

function toCard(row: GameRow, links: GameLinks): GameCard {
  const gameType = row.gameTypeId ? (links.gameTypes.get(row.gameTypeId) ?? null) : null

  return {
    id: row.id,
    name: row.name,
    sortName: row.sortName,
    ...coverUrls(row.coverAssetId),
    releaseDate: row.releaseDate,
    // numeric(4,1) arrives as a string from postgres.js; the API contract is a number.
    igdbRating: row.igdbRating === null ? null : Number(row.igdbRating),
    gameType,
    locations: (links.locations.get(row.id) ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
    })),
    genres: (links.genres.get(row.id) ?? []).map((g) => ({ id: g.id, name: g.name })),
  }
}

function toDetail(row: GameRow, links: GameLinks): GameDetail {
  return {
    ...toCard(row, links),
    igdbId: row.igdbId,
    summary: row.summary,
    notes: row.notes,
    acquiredAt: row.acquiredAt,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function createGamesService(repo: GamesRepository): GamesService {
  /**
   * Referenced taxonomy ids must belong to the acting user.
   *
   * Foreign keys only prove a row exists — not that it is *yours*. Without
   * this check a user could attach another user's location to their game by
   * guessing an id, which would leak that location's name and colour back
   * through the card chips. See docs/security.md §3.
   */
  async function assertOwned(
    userId: string,
    table: 'locations' | 'genres' | 'gameTypes',
    ids: string[],
    label: string,
  ): Promise<void> {
    if (ids.length === 0) return
    const unique = [...new Set(ids)]
    const owned = await repo.countOwned(userId, table, unique)
    if (owned !== unique.length) {
      throw new ValidationError(`One or more ${label} do not exist`)
    }
  }

  async function loadDetail(userId: string, id: string): Promise<GameDetail> {
    const row = await repo.findById(userId, id)
    if (!row) throw new NotFoundError('Game')
    const links = await repo.loadLinks(userId, [id])
    return toDetail(row, links)
  }

  return {
    list: async (userId, query) => {
      const { rows, total } = await repo.list(userId, {
        q: query.q,
        locationIds: query.locationId,
        gameTypeIds: query.gameTypeId,
        genreIds: query.genreId,
        sort: query.sort,
        page: query.page,
        perPage: query.perPage,
      })

      const links = await repo.loadLinks(
        userId,
        rows.map((r) => r.id),
      )

      return {
        data: rows.map((row) => toCard(row, links)),
        meta: {
          page: query.page,
          perPage: query.perPage,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.perPage)),
        },
      }
    },

    get: async (userId, id) => loadDetail(userId, id),

    create: async (userId, input) => {
      if (input.igdbId !== undefined) {
        const existing = await repo.findByIgdbId(userId, input.igdbId)
        if (existing) {
          // The duplicate-purchase guard. Hand back the existing game so the
          // UI can link straight to it rather than just saying "no".
          throw new ConflictError(`"${existing.name}" is already in your library`, {
            existingGameId: existing.id,
            existingGameName: existing.name,
          })
        }
      }

      await Promise.all([
        assertOwned(userId, 'gameTypes', input.gameTypeId ? [input.gameTypeId] : [], 'game types'),
        assertOwned(userId, 'locations', input.locationIds ?? [], 'locations'),
        assertOwned(userId, 'genres', input.genreIds ?? [], 'genres'),
      ])

      const id = await repo.insert(userId, {
        name: input.name,
        igdbId: input.igdbId ?? null,
        gameTypeId: input.gameTypeId ?? null,
        summary: input.summary ?? null,
        releaseDate: input.releaseDate ?? null,
        notes: input.notes ?? null,
        acquiredAt: input.acquiredAt ?? null,
      })

      if (input.locationIds) await repo.replaceLocations(userId, id, input.locationIds)
      if (input.genreIds) await repo.replaceGenres(userId, id, input.genreIds)

      return loadDetail(userId, id)
    },

    update: async (userId, id, input) => {
      const existing = await repo.findById(userId, id)
      if (!existing) throw new NotFoundError('Game')

      await Promise.all([
        assertOwned(userId, 'gameTypes', input.gameTypeId ? [input.gameTypeId] : [], 'game types'),
        assertOwned(userId, 'locations', input.locationIds ?? [], 'locations'),
        assertOwned(userId, 'genres', input.genreIds ?? [], 'genres'),
      ])

      const values: Parameters<GamesRepository['update']>[2] = {}
      if (input.name !== undefined) values.name = input.name
      if (input.igdbId !== undefined) values.igdbId = input.igdbId
      if (input.gameTypeId !== undefined) values.gameTypeId = input.gameTypeId
      if (input.summary !== undefined) values.summary = input.summary
      if (input.releaseDate !== undefined) values.releaseDate = input.releaseDate
      if (input.notes !== undefined) values.notes = input.notes
      if (input.acquiredAt !== undefined) values.acquiredAt = input.acquiredAt

      if (Object.keys(values).length > 0) {
        await repo.update(userId, id, values)
      }

      // Present means "replace the whole set", including with an empty array.
      if (input.locationIds !== undefined) {
        await repo.replaceLocations(userId, id, input.locationIds)
      }
      if (input.genreIds !== undefined) {
        await repo.replaceGenres(userId, id, input.genreIds)
      }

      return loadDetail(userId, id)
    },

    remove: async (userId, id) => {
      const deleted = await repo.remove(userId, id)
      if (!deleted) throw new NotFoundError('Game')
    },

    setCover: async (userId, id, assetId) => {
      const updated = await repo.setCover(userId, id, assetId)
      if (!updated) throw new NotFoundError('Game')
      return loadDetail(userId, id)
    },
  }
}
