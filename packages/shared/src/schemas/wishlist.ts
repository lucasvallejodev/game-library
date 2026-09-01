import { z } from 'zod'

import { displayNameSchema, timestampSchema } from './common.js'
import { paginationMetaSchema } from './games.js'

/**
 * Wanted, not owned.
 *
 * A separate resource from games rather than a status on them, because these
 * fields (priority, target price, store URL) would be permanently null on
 * every owned game. See docs/adr.md ADR-007.
 */

export const wishlistPrioritySchema = z.enum(['low', 'medium', 'high'])

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date as YYYY-MM-DD')

const repeatableUuid = z
  .union([z.uuid(), z.array(z.uuid())])
  .optional()
  .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]))

export const wishlistListQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  gameTypeId: repeatableUuid,
  genreId: repeatableUuid,
  priority: z
    .union([wishlistPrioritySchema, z.array(wishlistPrioritySchema)])
    .optional()
    .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v])),
  sort: z
    .enum(['name', '-name', 'createdAt', '-createdAt', 'priority', '-priority', 'targetPrice'])
    .default('name'),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(40),
})

export const wishlistItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  sortName: z.string(),
  igdbId: z.number().int().nullable(),
  summary: z.string().nullable(),
  releaseDate: z.string().nullable(),
  coverUrl: z.string().nullable(),
  thumbUrl: z.string().nullable(),
  gameType: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  genres: z.array(z.object({ id: z.uuid(), name: z.string() })),
  priority: wishlistPrioritySchema,
  /** Sent as a string: numeric(10,2) must not go through a float. */
  targetPrice: z.string().nullable(),
  currency: z.string().nullable(),
  storeUrl: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

export const wishlistListSchema = z.object({
  data: z.array(wishlistItemSchema),
  meta: paginationMetaSchema,
})

const wishlistFieldsSchema = z.object({
  name: displayNameSchema.optional(),
  igdbId: z.number().int().positive().optional(),
  gameTypeId: z.uuid().optional(),
  genreIds: z.array(z.uuid()).max(50).optional(),
  priority: wishlistPrioritySchema.optional(),
  /** A string, so a price never round-trips through binary floating point. */
  targetPrice: z
    .string()
    .regex(/^\d{1,8}(\.\d{1,2})?$/, 'must be a price such as 39.99')
    .optional(),
  currency: z
    .string()
    .length(3)
    .regex(/^[A-Za-z]{3}$/, 'must be a 3-letter ISO 4217 code')
    .optional(),
  storeUrl: z.url().optional(),
  notes: z.string().max(50_000).optional(),
})

export const createWishlistItemSchema = wishlistFieldsSchema.refine(
  (v) => v.name !== undefined || v.igdbId !== undefined,
  { message: 'provide a name, or an igdbId to import one from IGDB' },
)

export const updateWishlistItemSchema = wishlistFieldsSchema
  .extend({
    gameTypeId: z.uuid().nullable().optional(),
    targetPrice: z
      .string()
      .regex(/^\d{1,8}(\.\d{1,2})?$/)
      .nullable()
      .optional(),
    currency: z.string().length(3).nullable().optional(),
    storeUrl: z.url().nullable().optional(),
    notes: z.string().max(50_000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'provide at least one field to update' })

/** Bought it: move the item into the library. */
export const promoteWishlistItemSchema = z.object({
  locationIds: z.array(z.uuid()).max(50).optional(),
  acquiredAt: isoDateSchema.optional(),
})

// ── The duplicate-purchase guard ────────────────────────────────────────────

export const duplicateCheckQuerySchema = z.object({
  igdbId: z.coerce.number().int().positive(),
})

/**
 * "Do I already have this?" — the question the whole project exists to answer.
 */
export const duplicateCheckSchema = z.object({
  owned: z.boolean(),
  game: z
    .object({
      id: z.uuid(),
      name: z.string(),
      locations: z.array(z.object({ id: z.uuid(), name: z.string(), color: z.string() })),
    })
    .nullable(),
  wishlisted: z.boolean(),
  wishlistItem: z.object({ id: z.uuid(), name: z.string() }).nullable(),
})

export const statsSchema = z.object({
  totalGames: z.number().int(),
  totalWishlist: z.number().int(),
  byLocation: z.array(
    z.object({ id: z.uuid(), name: z.string(), color: z.string(), count: z.number().int() }),
  ),
  byGameType: z.array(z.object({ id: z.uuid(), name: z.string(), count: z.number().int() })),
  topGenres: z.array(z.object({ id: z.uuid(), name: z.string(), count: z.number().int() })),
})

export type WishlistItem = z.infer<typeof wishlistItemSchema>
export type WishlistList = z.infer<typeof wishlistListSchema>
export type WishlistPriority = z.infer<typeof wishlistPrioritySchema>
export type CreateWishlistItemInput = z.infer<typeof createWishlistItemSchema>
export type UpdateWishlistItemInput = z.infer<typeof updateWishlistItemSchema>
export type DuplicateCheck = z.infer<typeof duplicateCheckSchema>
export type Stats = z.infer<typeof statsSchema>
