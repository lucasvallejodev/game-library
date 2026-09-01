import { describe, expect, it } from 'vitest'

import { aliasForIgdbGenre } from './igdb-genres.js'

/**
 * IGDB's complete genre vocabulary, fetched from /v4/genres on 2026-09-01.
 *
 * Pinned here so the alias table is checked against reality rather than
 * against what someone remembered. If IGDB adds a genre this list goes stale,
 * but staleness only means the new genre gets created rather than merged —
 * which is the intended fallback, not a failure.
 */
const IGDB_GENRES = [
  'Point-and-click',
  'Fighting',
  'Shooter',
  'Music',
  'Platform',
  'Puzzle',
  'Racing',
  'Real Time Strategy (RTS)',
  'Role-playing (RPG)',
  'Simulator',
  'Sport',
  'Strategy',
  'Turn-based strategy (TBS)',
  'Tactical',
  "Hack and slash/Beat 'em up",
  'Quiz/Trivia',
  'Pinball',
  'Adventure',
  'Indie',
  'Arcade',
  'Visual Novel',
  'Card & Board Game',
  'MOBA',
] as const

/** The slugs seeded into every new account (ADR-014). */
const DEFAULT_SLUGS = new Set([
  'action',
  'adventure',
  'rpg',
  'strategy',
  'shooter',
  'platformer',
  'puzzle',
  'racing',
  'simulation',
  'sports',
  'fighting',
  'horror',
  'indie',
  'mmo',
])

/** Deliberately unmapped: no honest equivalent among the defaults. */
const INTENTIONALLY_UNMAPPED = new Set(['Music', 'Pinball', 'MOBA'])

describe('IGDB genre aliases', () => {
  it('only ever points at a real seeded default', () => {
    for (const name of IGDB_GENRES) {
      const slug = aliasForIgdbGenre(name)
      if (slug === null) continue
      // The original table mapped Pinball to "arcade", which is not one of our
      // defaults — so the alias silently did nothing.
      expect(DEFAULT_SLUGS.has(slug), `${name} -> ${slug} is not a seeded default`).toBe(true)
    }
  })

  it('maps every IGDB genre that has an equivalent', () => {
    for (const name of IGDB_GENRES) {
      if (INTENTIONALLY_UNMAPPED.has(name)) continue
      expect(aliasForIgdbGenre(name), `${name} should map to a default`).not.toBeNull()
    }
  })

  it('leaves genres with no honest equivalent to be created', () => {
    for (const name of INTENTIONALLY_UNMAPPED) {
      expect(aliasForIgdbGenre(name)).toBeNull()
    }
  })

  it('maps the names that actually matter', () => {
    expect(aliasForIgdbGenre('Role-playing (RPG)')).toBe('rpg')
    expect(aliasForIgdbGenre('Platform')).toBe('platformer')
    expect(aliasForIgdbGenre('Simulator')).toBe('simulation')
    expect(aliasForIgdbGenre('Sport')).toBe('sports')
    // The apostrophe is the exact character that broke the first attempt.
    expect(aliasForIgdbGenre("Hack and slash/Beat 'em up")).toBe('action')
  })

  it('is insensitive to case, spacing and curly apostrophes', () => {
    expect(aliasForIgdbGenre('ROLE-PLAYING (RPG)')).toBe('rpg')
    expect(aliasForIgdbGenre('  Role-playing (RPG)  ')).toBe('rpg')
    expect(aliasForIgdbGenre('Hack and slash/Beat ’em up')).toBe('action')
  })

  it('returns null for anything unknown', () => {
    expect(aliasForIgdbGenre('Metroidvania')).toBeNull()
    expect(aliasForIgdbGenre('')).toBeNull()
  })
})
