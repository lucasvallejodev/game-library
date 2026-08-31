import { z } from 'zod'

/**
 * The IGDB proxy. The browser never holds a Twitch token and never contacts
 * IGDB directly — see docs/security.md §4.
 */

export const igdbSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const igdbGameSchema = z.object({
  igdbId: z.number().int(),
  name: z.string(),
  summary: z.string().nullable(),
  releaseDate: z.string().nullable(),
  rating: z.number().nullable(),
  /** IGDB CDN preview only. Mirrored into our storage when the game is saved. */
  coverUrl: z.string().nullable(),
  genres: z.array(z.string()),
  /**
   * Annotated against the caller's own data, so the search list can flag what
   * you already have before you try to add it. This is the duplicate-purchase
   * guard doing its job at the earliest possible moment.
   */
  inLibrary: z.boolean(),
  inWishlist: z.boolean(),
  /** Present when inLibrary, so the UI can link straight to the game. */
  existingGameId: z.uuid().nullable(),
})

export const igdbSearchResultSchema = z.object({ data: z.array(igdbGameSchema) })

export const igdbIdParamSchema = z.object({
  igdbId: z.coerce.number().int().positive(),
})

export type IgdbGame = z.infer<typeof igdbGameSchema>
export type IgdbSearchQuery = z.infer<typeof igdbSearchQuerySchema>
