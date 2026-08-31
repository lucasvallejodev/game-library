import { slugify } from '@game-library/shared'

/**
 * Defaults seeded into every new account, inside the signup transaction, so an
 * account can never exist without them. Confirmed in docs/adr.md ADR-014.
 *
 * No default Locations: those are personal (`WD 4TB External`), so the UI
 * prompts for the first one rather than guessing.
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

export interface SeedRow {
  name: string
  slug: string
  isDefault: true
}

export function defaultGameTypeRows(): SeedRow[] {
  return DEFAULT_GAME_TYPES.map((name) => ({ name, slug: slugify(name), isDefault: true }))
}

export function defaultGenreRows(): SeedRow[] {
  return DEFAULT_GENRES.map((name) => ({ name, slug: slugify(name), isDefault: true }))
}
