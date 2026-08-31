import { type Database, schema } from '@game-library/db'
import { slugify } from '@game-library/shared'

/**
 * Defaults every new account starts with. Confirmed in docs/adr.md ADR-014.
 * No default Locations — those are personal, so the UI prompts for the first.
 */
export const DEFAULT_GAME_TYPES = ['Physical', 'Digital', 'Subscription', 'Emulated'] as const

export const DEFAULT_GENRES = [
  'Action',
  'Adventure',
  'RPG',
  'Strategy',
  'Shooter',
  'Platformer',
  'Puzzle',
  'Racing',
  'Simulation',
  'Sports',
  'Fighting',
  'Horror',
  'Indie',
  'MMO',
] as const

export interface SeedResult {
  gameTypes: number
  genres: number
}

/**
 * Give a user their default GameTypes and Genres.
 *
 * **Idempotent by construction.** Both inserts rely on the per-user unique
 * indexes (`UNIQUE (user_id, slug)`) with ON CONFLICT DO NOTHING, so calling
 * this twice is a no-op rather than an error.
 *
 * That property is load-bearing. Better Auth 1.7's Drizzle adapter implements
 * no `transaction`, so its `runWithTransaction` around sign-up degrades to
 * sequential writes and this cannot run inside the user INSERT's transaction.
 * Being safely re-runnable is what lets us recover instead: if the hook fails,
 * the next call heals the account. See docs/adr.md ADR-016.
 */
export async function seedUserDefaults(db: Database, userId: string): Promise<SeedResult> {
  const gameTypeRows = DEFAULT_GAME_TYPES.map((name) => ({
    userId,
    name,
    slug: slugify(name),
    isDefault: true,
  }))

  const genreRows = DEFAULT_GENRES.map((name) => ({
    userId,
    name,
    slug: slugify(name),
    isDefault: true,
  }))

  const [insertedTypes, insertedGenres] = await Promise.all([
    db.insert(schema.gameTypes).values(gameTypeRows).onConflictDoNothing().returning({
      id: schema.gameTypes.id,
    }),
    db.insert(schema.genres).values(genreRows).onConflictDoNothing().returning({
      id: schema.genres.id,
    }),
  ])

  return { gameTypes: insertedTypes.length, genres: insertedGenres.length }
}
