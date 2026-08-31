import { z } from 'zod'

import { displayNameSchema, timestampSchema } from './common.js'

/**
 * The library. See docs/api-endpoints.md.
 *
 * There is no `status` field: presence in the library means owned, and
 * play-state tracking was declined (docs/adr.md ADR-013).
 */

/**
 * A filter that may be repeated in the query string (`?genreId=a&genreId=b`).
 * Fastify's parser yields a bare string for one value and an array for many,
 * so normalise to an array before anything downstream has to care.
 */
const repeatableUuid = z
  .union([z.uuid(), z.array(z.uuid())])
  .optional()
  .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]))

export const gameSortSchema = z
  .enum([
    'name',
    '-name',
    'createdAt',
    '-createdAt',
    'releaseDate',
    '-releaseDate',
    'rating',
    '-rating',
  ])
  .default('name')

export const gameListQuerySchema = z.object({
  /** Name search, backed by the pg_trgm index. */
  q: z.string().trim().min(1).max(200).optional(),
  locationId: repeatableUuid,
  gameTypeId: repeatableUuid,
  genreId: repeatableUuid,
  sort: gameSortSchema,
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(40),
})

export type GameListQuery = z.infer<typeof gameListQuerySchema>

const locationChipSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.string(),
})

const genreChipSchema = z.object({
  id: z.uuid(),
  name: z.string(),
})

const gameTypeRefSchema = z.object({
  id: z.uuid(),
  name: z.string(),
})

/** Grid-shaped: only what a card renders. */
export const gameCardSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  sortName: z.string(),
  coverUrl: z.string().nullable(),
  thumbUrl: z.string().nullable(),
  releaseDate: z.string().nullable(),
  igdbRating: z.number().nullable(),
  gameType: gameTypeRefSchema.nullable(),
  locations: z.array(locationChipSchema),
  genres: z.array(genreChipSchema),
})

export const gameDetailSchema = gameCardSchema.extend({
  igdbId: z.number().int().nullable(),
  summary: z.string().nullable(),
  /** Raw markdown, exactly as the user typed it. Sanitized at render. */
  notes: z.string().nullable(),
  acquiredAt: z.string().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

export const paginationMetaSchema = z.object({
  page: z.number().int(),
  perPage: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
})

export const gameListSchema = z.object({
  data: z.array(gameCardSchema),
  meta: paginationMetaSchema,
})

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date as YYYY-MM-DD')

const gameFieldsSchema = z.object({
  name: displayNameSchema.optional(),
  igdbId: z.number().int().positive().optional(),
  gameTypeId: z.uuid().optional(),
  /** Replaces the full set. A game may sit in several locations at once. */
  locationIds: z.array(z.uuid()).max(50).optional(),
  genreIds: z.array(z.uuid()).max(50).optional(),
  summary: z.string().max(5000).optional(),
  releaseDate: isoDateSchema.optional(),
  notes: z.string().max(50_000).optional(),
  acquiredAt: isoDateSchema.optional(),
})

/**
 * A name is required *unless* an igdbId is given, in which case the server
 * fills the name in from IGDB. See docs/api-endpoints.md.
 */
export const createGameSchema = gameFieldsSchema.refine(
  (v) => v.name !== undefined || v.igdbId !== undefined,
  { message: 'provide a name, or an igdbId to import one from IGDB' },
)

/**
 * Every field optional, but at least one required — an empty PATCH should be a
 * 422 rather than a silent no-op. `null` clears a nullable field.
 */
export const updateGameSchema = gameFieldsSchema
  .extend({
    gameTypeId: z.uuid().nullable().optional(),
    summary: z.string().max(5000).nullable().optional(),
    releaseDate: isoDateSchema.nullable().optional(),
    notes: z.string().max(50_000).nullable().optional(),
    acquiredAt: isoDateSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'provide at least one field to update' })

export type GameCard = z.infer<typeof gameCardSchema>
export type GameDetail = z.infer<typeof gameDetailSchema>
export type CreateGameInput = z.infer<typeof createGameSchema>
export type UpdateGameInput = z.infer<typeof updateGameSchema>
export type GameList = z.infer<typeof gameListSchema>
