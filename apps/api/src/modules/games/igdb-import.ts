import { type Database, schema } from '@game-library/db'
import { slugify } from '@game-library/shared'
import { and, eq, inArray } from 'drizzle-orm'

import { aliasForIgdbGenre } from './igdb-genres.js'

/**
 * Resolve IGDB genres to this user's own genre rows.
 *
 * The alias table lives in igdb-genres.ts and is verified against IGDB's live
 * genre list. See docs/adr.md ADR-018.
 */

export interface IgdbGenreRef {
  igdbId: number
  name: string
}

/**
 * Resolve IGDB genres to this user's genre ids, creating any that are genuinely
 * new. Also backfills `genres.igdb_id` on first match, so subsequent imports
 * resolve by id and never depend on the alias table again.
 */
export async function resolveGenreIds(
  db: Database,
  userId: string,
  igdbGenres: IgdbGenreRef[],
): Promise<string[]> {
  if (igdbGenres.length === 0) return []

  const { genres } = schema

  const existing = await db
    .select({ id: genres.id, slug: genres.slug, igdbId: genres.igdbId })
    .from(genres)
    .where(eq(genres.userId, userId))

  const bySlug = new Map(existing.map((g) => [g.slug, g]))
  const byIgdbId = new Map(existing.filter((g) => g.igdbId !== null).map((g) => [g.igdbId, g]))

  const resolved: string[] = []
  const backfill: { id: string; igdbId: number }[] = []

  for (const igdbGenre of igdbGenres) {
    const direct = byIgdbId.get(igdbGenre.igdbId)
    if (direct) {
      resolved.push(direct.id)
      continue
    }

    const candidateSlug = aliasForIgdbGenre(igdbGenre.name) ?? slugify(igdbGenre.name)
    const matched = bySlug.get(candidateSlug)

    if (matched) {
      resolved.push(matched.id)
      if (matched.igdbId === null) backfill.push({ id: matched.id, igdbId: igdbGenre.igdbId })
      continue
    }

    const inserted = await db
      .insert(genres)
      .values({
        userId,
        name: igdbGenre.name,
        slug: candidateSlug || slugify(`genre-${String(igdbGenre.igdbId)}`),
        igdbId: igdbGenre.igdbId,
        isDefault: false,
      })
      .onConflictDoNothing()
      .returning({ id: genres.id })

    if (inserted[0]) {
      resolved.push(inserted[0].id)
    } else {
      // Lost a race, or the slug collided — re-read rather than dropping it.
      const again = await db
        .select({ id: genres.id })
        .from(genres)
        .where(and(eq(genres.userId, userId), eq(genres.slug, candidateSlug)))
      if (again[0]) resolved.push(again[0].id)
    }
  }

  if (backfill.length > 0) {
    await Promise.all(
      backfill.map(({ id, igdbId }) =>
        db
          .update(genres)
          .set({ igdbId })
          .where(and(eq(genres.userId, userId), eq(genres.id, id))),
      ),
    )
  }

  return [...new Set(resolved)]
}

/** Genre names for a set of ids, used when asserting import results. */
export async function genreNamesFor(db: Database, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const rows = await db
    .select({ name: schema.genres.name })
    .from(schema.genres)
    .where(inArray(schema.genres.id, ids))
  return rows.map((r) => r.name)
}
