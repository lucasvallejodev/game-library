import type {
  CreateGameTypeInput,
  CreateGenreInput,
  CreateLocationInput,
  GameType,
  Genre,
  Location,
  UpdateGameTypeInput,
  UpdateGenreInput,
  UpdateLocationInput,
} from '@game-library/shared/schemas'
import { slugify } from '@game-library/shared'

import { ConflictError, NotFoundError, ValidationError } from '../../errors.js'
import type {
  GameTypeRow,
  GenreRow,
  LocationRow,
  TaxonomyRepository,
} from './taxonomy.repository.js'

/**
 * Business rules for the taxonomy resources.
 *
 * No SQL and no request/response objects: this layer decides *what* should
 * happen, the repository decides *how* to read and write, and routes deal with
 * HTTP. See docs/architecture.md §5.
 */

function toLocation(row: LocationRow): Location {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    color: row.color,
    sortOrder: row.sortOrder,
    // Resolved to a real URL in increment 7, once media serving exists.
    logoUrl: row.logoAssetId ? `/api/media/${row.logoAssetId}/logo.webp` : null,
    gameCount: row.gameCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toGameType(row: GameTypeRow): GameType {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isDefault: row.isDefault,
    gameCount: row.gameCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toGenre(row: GenreRow): Genre {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    igdbId: row.igdbId,
    isDefault: row.isDefault,
    gameCount: row.gameCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * A name that slugs to nothing ("!!!", "---") would collide with every other
 * such name on the empty-string slug, so reject it at the boundary.
 */
function requireSlug(name: string): string {
  const slug = slugify(name)
  if (!slug) {
    throw new ValidationError('name must contain at least one letter or number')
  }
  return slug
}

export interface TaxonomyService {
  locations: {
    list: (userId: string) => Promise<Location[]>
    get: (userId: string, id: string) => Promise<Location>
    create: (userId: string, input: CreateLocationInput) => Promise<Location>
    update: (userId: string, id: string, input: UpdateLocationInput) => Promise<Location>
    remove: (userId: string, id: string) => Promise<void>
  }
  gameTypes: {
    list: (userId: string) => Promise<GameType[]>
    get: (userId: string, id: string) => Promise<GameType>
    create: (userId: string, input: CreateGameTypeInput) => Promise<GameType>
    update: (userId: string, id: string, input: UpdateGameTypeInput) => Promise<GameType>
    remove: (userId: string, id: string) => Promise<void>
  }
  genres: {
    list: (userId: string) => Promise<Genre[]>
    get: (userId: string, id: string) => Promise<Genre>
    create: (userId: string, input: CreateGenreInput) => Promise<Genre>
    update: (userId: string, id: string, input: UpdateGenreInput) => Promise<Genre>
    remove: (userId: string, id: string) => Promise<void>
  }
}

export function createTaxonomyService(repo: TaxonomyRepository): TaxonomyService {
  return {
    locations: {
      list: async (userId) => (await repo.locations.list(userId)).map(toLocation),

      get: async (userId, id) => {
        const row = await repo.locations.findById(userId, id)
        // Another user's row is indistinguishable from a missing one: a 403
        // would confirm it exists. See docs/security.md §3.
        if (!row) throw new NotFoundError('Location')
        return toLocation(row)
      },

      create: async (userId, input) => {
        const slug = requireSlug(input.name)
        if (await repo.locations.findBySlug(userId, slug)) {
          throw new ConflictError(`A location named "${input.name}" already exists`)
        }

        const id = await repo.locations.insert(userId, {
          name: input.name,
          slug,
          color: input.color,
          sortOrder: input.sortOrder ?? 0,
        })

        const row = await repo.locations.findById(userId, id)
        if (!row) throw new NotFoundError('Location')
        return toLocation(row)
      },

      update: async (userId, id, input) => {
        const existing = await repo.locations.findById(userId, id)
        if (!existing) throw new NotFoundError('Location')

        const values: Parameters<TaxonomyRepository['locations']['update']>[2] = {}

        if (input.name !== undefined) {
          const slug = requireSlug(input.name)
          const clash = await repo.locations.findBySlug(userId, slug)
          if (clash && clash.id !== id) {
            throw new ConflictError(`A location named "${input.name}" already exists`)
          }
          values.name = input.name
          values.slug = slug
        }
        if (input.color !== undefined) values.color = input.color
        if (input.sortOrder !== undefined) values.sortOrder = input.sortOrder

        await repo.locations.update(userId, id, values)

        const row = await repo.locations.findById(userId, id)
        if (!row) throw new NotFoundError('Location')
        return toLocation(row)
      },

      remove: async (userId, id) => {
        // Deleting a location removes its link rows via ON DELETE CASCADE.
        // The games themselves survive — see docs/api-endpoints.md.
        const deleted = await repo.locations.remove(userId, id)
        if (!deleted) throw new NotFoundError('Location')
      },
    },

    gameTypes: {
      list: async (userId) => (await repo.gameTypes.list(userId)).map(toGameType),

      get: async (userId, id) => {
        const row = await repo.gameTypes.findById(userId, id)
        if (!row) throw new NotFoundError('Game type')
        return toGameType(row)
      },

      create: async (userId, input) => {
        const slug = requireSlug(input.name)
        if (await repo.gameTypes.findBySlug(userId, slug)) {
          throw new ConflictError(`A game type named "${input.name}" already exists`)
        }
        const id = await repo.gameTypes.insert(userId, { name: input.name, slug })
        const row = await repo.gameTypes.findById(userId, id)
        if (!row) throw new NotFoundError('Game type')
        return toGameType(row)
      },

      update: async (userId, id, input) => {
        const existing = await repo.gameTypes.findById(userId, id)
        if (!existing) throw new NotFoundError('Game type')

        const values: Parameters<TaxonomyRepository['gameTypes']['update']>[2] = {}
        if (input.name !== undefined) {
          const slug = requireSlug(input.name)
          const clash = await repo.gameTypes.findBySlug(userId, slug)
          if (clash && clash.id !== id) {
            throw new ConflictError(`A game type named "${input.name}" already exists`)
          }
          values.name = input.name
          values.slug = slug
        }

        await repo.gameTypes.update(userId, id, values)
        const row = await repo.gameTypes.findById(userId, id)
        if (!row) throw new NotFoundError('Game type')
        return toGameType(row)
      },

      remove: async (userId, id) => {
        // Games keep existing; their game_type_id becomes NULL via
        // ON DELETE SET NULL. Losing a label must not lose the game.
        const deleted = await repo.gameTypes.remove(userId, id)
        if (!deleted) throw new NotFoundError('Game type')
      },
    },

    genres: {
      list: async (userId) => (await repo.genres.list(userId)).map(toGenre),

      get: async (userId, id) => {
        const row = await repo.genres.findById(userId, id)
        if (!row) throw new NotFoundError('Genre')
        return toGenre(row)
      },

      create: async (userId, input) => {
        const slug = requireSlug(input.name)
        if (await repo.genres.findBySlug(userId, slug)) {
          throw new ConflictError(`A genre named "${input.name}" already exists`)
        }
        const id = await repo.genres.insert(userId, { name: input.name, slug })
        const row = await repo.genres.findById(userId, id)
        if (!row) throw new NotFoundError('Genre')
        return toGenre(row)
      },

      update: async (userId, id, input) => {
        const existing = await repo.genres.findById(userId, id)
        if (!existing) throw new NotFoundError('Genre')

        const values: Parameters<TaxonomyRepository['genres']['update']>[2] = {}
        if (input.name !== undefined) {
          const slug = requireSlug(input.name)
          const clash = await repo.genres.findBySlug(userId, slug)
          if (clash && clash.id !== id) {
            throw new ConflictError(`A genre named "${input.name}" already exists`)
          }
          values.name = input.name
          values.slug = slug
        }

        await repo.genres.update(userId, id, values)
        const row = await repo.genres.findById(userId, id)
        if (!row) throw new NotFoundError('Genre')
        return toGenre(row)
      },

      remove: async (userId, id) => {
        // Only the join rows go; games are untouched.
        const deleted = await repo.genres.remove(userId, id)
        if (!deleted) throw new NotFoundError('Genre')
      },
    },
  }
}
