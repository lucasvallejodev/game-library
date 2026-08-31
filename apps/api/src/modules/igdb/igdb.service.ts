import { type Database, schema } from '@game-library/db'
import type { IgdbGame } from '@game-library/shared/schemas'
import { and, eq, inArray } from 'drizzle-orm'

import { NotFoundError } from '../../errors.js'
import type { IgdbClient } from '../../igdb/igdb.client.js'
import { mapGame, type MappedGame } from '../../igdb/igdb.mapper.js'

export interface IgdbService {
  search: (userId: string, query: string, limit: number) => Promise<IgdbGame[]>
  getGame: (userId: string, igdbId: number) => Promise<IgdbGame>
  /** Raw mapped metadata, for the games module to build a row from. */
  fetchForImport: (igdbId: number) => Promise<MappedGame>
}

export function createIgdbService(db: Database, client: IgdbClient): IgdbService {
  const { games, wishlistItems } = schema

  /**
   * Annotate a page of IGDB results with what this user already has.
   *
   * Two batched queries rather than one per result: a 50-result search would
   * otherwise fire 100 round trips.
   */
  async function annotate(userId: string, mapped: MappedGame[]): Promise<IgdbGame[]> {
    const igdbIds = mapped.map((m) => m.igdbId)

    if (igdbIds.length === 0) return []

    const [owned, wanted] = await Promise.all([
      db
        .select({ id: games.id, igdbId: games.igdbId })
        .from(games)
        .where(and(eq(games.userId, userId), inArray(games.igdbId, igdbIds))),
      db
        .select({ igdbId: wishlistItems.igdbId })
        .from(wishlistItems)
        .where(and(eq(wishlistItems.userId, userId), inArray(wishlistItems.igdbId, igdbIds))),
    ])

    const ownedByIgdbId = new Map(owned.map((row) => [row.igdbId, row.id]))
    const wantedIds = new Set(wanted.map((row) => row.igdbId))

    return mapped.map((game) => ({
      igdbId: game.igdbId,
      name: game.name,
      summary: game.summary,
      releaseDate: game.releaseDate,
      rating: game.rating,
      coverUrl: game.coverUrl,
      genres: game.genres.map((g) => g.name),
      inLibrary: ownedByIgdbId.has(game.igdbId),
      inWishlist: wantedIds.has(game.igdbId),
      existingGameId: ownedByIgdbId.get(game.igdbId) ?? null,
    }))
  }

  return {
    search: async (userId, query, limit) => {
      const raw = await client.search(query, limit)
      return annotate(userId, raw.map(mapGame))
    },

    getGame: async (userId, igdbId) => {
      const raw = await client.getById(igdbId)
      if (!raw) throw new NotFoundError('IGDB game')
      const [annotated] = await annotate(userId, [mapGame(raw)])
      if (!annotated) throw new NotFoundError('IGDB game')
      return annotated
    },

    fetchForImport: async (igdbId) => {
      const raw = await client.getById(igdbId)
      if (!raw) throw new NotFoundError('IGDB game')
      return mapGame(raw)
    },
  }
}
