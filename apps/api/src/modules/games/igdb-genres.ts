/**
 * IGDB genre name → the slug of one of our seeded default genres.
 *
 * **Verified against the live IGDB `/v4/genres` endpoint on 2026-09-01**, not
 * guessed. An earlier hand-written version had several keys that never matched
 * anything — `hack and slash/beat em up` was missing its apostrophe, and
 * `pinball` mapped to `arcade`, which is not one of our defaults at all. The
 * result was silent near-duplicates appearing beside the seeded genres.
 *
 * Our 14 defaults are: action, adventure, rpg, strategy, shooter, platformer,
 * puzzle, racing, simulation, sports, fighting, horror, indie, mmo.
 *
 * Anything absent here is deliberate: Music, Pinball and MOBA have no honest
 * equivalent among the defaults, so they are created as new genres rather than
 * forced into a wrong bucket. See docs/adr.md ADR-018.
 */
const IGDB_GENRE_ALIASES: Record<string, string> = {
  'point-and-click': 'adventure',
  fighting: 'fighting',
  shooter: 'shooter',
  platform: 'platformer',
  puzzle: 'puzzle',
  racing: 'racing',
  'real time strategy (rts)': 'strategy',
  'role-playing (rpg)': 'rpg',
  simulator: 'simulation',
  sport: 'sports',
  strategy: 'strategy',
  'turn-based strategy (tbs)': 'strategy',
  tactical: 'strategy',
  "hack and slash/beat 'em up": 'action',
  'quiz/trivia': 'puzzle',
  adventure: 'adventure',
  indie: 'indie',
  arcade: 'action',
  'visual novel': 'adventure',
  'card & board game': 'strategy',
}

/**
 * Normalise before lookup: IGDB is consistent about its apostrophes today, but
 * a curly quote arriving in one record should not silently create a duplicate
 * genre. Comparing on a folded form is cheap insurance.
 */
function normalize(name: string): string {
  return name.toLowerCase().replaceAll('’', "'").replace(/\s+/g, ' ').trim()
}

/** The default-genre slug this IGDB genre maps onto, or null to create a new one. */
export function aliasForIgdbGenre(name: string): string | null {
  return IGDB_GENRE_ALIASES[normalize(name)] ?? null
}
