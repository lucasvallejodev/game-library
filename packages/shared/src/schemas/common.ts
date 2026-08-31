import { z } from 'zod'

/**
 * Building blocks shared by every resource schema.
 *
 * These live in packages/shared because the API validates requests with them
 * and the web app types its client and forms from the same definitions — so a
 * breaking payload change is a TypeScript error on both sides in one commit.
 * See docs/architecture.md §3.
 */

export const idParamSchema = z.object({
  id: z.uuid(),
})

/**
 * `#RRGGBB`. Enforced here *and* by a Postgres CHECK constraint, because the
 * value is interpolated into styles and must never be free text.
 * See docs/security.md §6.
 */
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'must be a hex colour such as #7B4FBF')

export const displayNameSchema = z.string().trim().min(1).max(100)

/** ISO-8601 timestamps: services map Date columns to strings at the boundary. */
export const timestampSchema = z.iso.datetime()

/** Every list response uses this envelope. See docs/api-endpoints.md. */
export function listOf<T extends z.ZodTypeAny>(item: T) {
  return z.object({ data: z.array(item) })
}

export type IdParam = z.infer<typeof idParamSchema>
