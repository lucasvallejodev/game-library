import { z } from 'zod'

import { displayNameSchema, hexColorSchema, listOf, timestampSchema } from './common.js'

/**
 * Locations, game types and genres.
 *
 * All three are per-user rows rather than global lookups, which is what makes
 * seeded defaults renameable without affecting anyone else. Uniqueness is
 * always scoped to the user. See docs/database.md §1.
 */

// ── Locations ───────────────────────────────────────────────────────────────

export const createLocationSchema = z.object({
  name: displayNameSchema,
  color: hexColorSchema,
  sortOrder: z.number().int().min(0).optional(),
})

/** At least one field, so an empty PATCH is a 422 rather than a silent no-op. */
export const updateLocationSchema = createLocationSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'provide at least one field to update' })

export const locationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  color: z.string(),
  sortOrder: z.number().int(),
  logoUrl: z.string().nullable(),
  /** Games present in this location — drives the sidebar counts. */
  gameCount: z.number().int(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

export const locationListSchema = listOf(locationSchema)

// ── Game types ──────────────────────────────────────────────────────────────

export const createGameTypeSchema = z.object({
  name: displayNameSchema,
})

export const updateGameTypeSchema = createGameTypeSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'provide at least one field to update' })

export const gameTypeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  /** True for rows created by the signup seed; the UI marks these. */
  isDefault: z.boolean(),
  gameCount: z.number().int(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

export const gameTypeListSchema = listOf(gameTypeSchema)

// ── Genres ──────────────────────────────────────────────────────────────────

export const createGenreSchema = z.object({
  name: displayNameSchema,
})

export const updateGenreSchema = createGenreSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'provide at least one field to update' })

export const genreSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  igdbId: z.number().int().nullable(),
  isDefault: z.boolean(),
  gameCount: z.number().int(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

export const genreListSchema = listOf(genreSchema)

// ── Inferred types ──────────────────────────────────────────────────────────

export type CreateLocationInput = z.infer<typeof createLocationSchema>
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>
export type Location = z.infer<typeof locationSchema>

export type CreateGameTypeInput = z.infer<typeof createGameTypeSchema>
export type UpdateGameTypeInput = z.infer<typeof updateGameTypeSchema>
export type GameType = z.infer<typeof gameTypeSchema>

export type CreateGenreInput = z.infer<typeof createGenreSchema>
export type UpdateGenreInput = z.infer<typeof updateGenreSchema>
export type Genre = z.infer<typeof genreSchema>
