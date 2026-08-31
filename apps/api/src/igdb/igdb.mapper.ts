import type { IgdbRawGame } from './igdb.client.js'

/**
 * The only place IGDB's response shape is understood.
 *
 * Field names like `first_release_date` and `image_id` never leak past this
 * file — everything downstream sees our domain shape, so a change at IGDB is
 * a one-file change here. See docs/architecture.md §6.
 */

export interface MappedGame {
  igdbId: number
  name: string
  summary: string | null
  /** YYYY-MM-DD, or null when IGDB has no date. */
  releaseDate: string | null
  /** 0–100, one decimal. */
  rating: number | null
  /** Absolute IGDB CDN URL, or null. Only ever fetched server-side. */
  coverUrl: string | null
  genres: { igdbId: number; name: string }[]
}

/** The only host cover mirroring is allowed to fetch from. See docs/security.md §5. */
export const IGDB_IMAGE_HOST = 'images.igdb.com'

/** `t_cover_big` is 264×374 — comfortably above our 720px re-encode target at 2x. */
export function coverUrlFor(imageId: string): string {
  return `https://${IGDB_IMAGE_HOST}/igdb/image/upload/t_cover_big/${imageId}.jpg`
}

/**
 * IGDB stores release dates as a Unix timestamp at midnight UTC. Read it in
 * UTC, never local time — `toLocaleDateString` on a machine west of Greenwich
 * would shift every release back by a day.
 */
function toIsoDate(unixSeconds: number | undefined): string | null {
  if (unixSeconds === undefined) return null
  const date = new Date(unixSeconds * 1000)
  return Number.isNaN(date.getTime()) ? null : (date.toISOString().split('T')[0] ?? null)
}

export function mapGame(raw: IgdbRawGame): MappedGame {
  const imageId = raw.cover?.image_id

  return {
    igdbId: raw.id,
    name: raw.name,
    summary: raw.summary ?? null,
    releaseDate: toIsoDate(raw.first_release_date),
    rating: raw.rating === undefined ? null : Math.round(raw.rating * 10) / 10,
    coverUrl: imageId ? coverUrlFor(imageId) : null,
    genres: (raw.genres ?? []).map((g) => ({ igdbId: g.id, name: g.name })),
  }
}
