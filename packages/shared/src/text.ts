/**
 * Pure text helpers shared by the API and the web app.
 *
 * These exist here rather than in the API because the web app needs the same
 * results to preview a slug while the user types, and any divergence between
 * the two would produce "that name is taken" errors the user cannot explain.
 */

const DIACRITICS = /[̀-ͯ]/g
const NON_SLUG_CHARS = /[^a-z0-9]+/g
const EDGE_DASHES = /^-+|-+$/g
const LEADING_ARTICLE = /^(?:the|a|an)\s+/i
const WHITESPACE = /\s+/g

/**
 * Convert a display name into a URL-safe, comparison-safe slug.
 *
 * Used for the `slug` column on locations, genres and game types, where
 * uniqueness is scoped per user (`UNIQUE (user_id, slug)`). Slugging before
 * the uniqueness check is what makes "WD 4TB External" and "WD 4TB  external"
 * collide, which is the behaviour we want.
 *
 * @example
 * slugify('WD 4TB External')   // 'wd-4tb-external'
 * slugify('Café Racer!')       // 'cafe-racer'
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(NON_SLUG_CHARS, '-')
    .replace(EDGE_DASHES, '')
}

/**
 * Derive the value used for alphabetical sorting of a game title.
 *
 * Strips a single leading article so "The Witcher 3" files under W, matching
 * what people expect from a shelf. Backs the `sort_name` column on `games`
 * and `wishlist_items`.
 *
 * @example
 * sortName('The Witcher 3')    // 'Witcher 3'
 * sortName('A Plague Tale')    // 'Plague Tale'
 * sortName('Anno 1800')        // 'Anno 1800'  (not an article)
 */
export function sortName(name: string): string {
  return name.trim().replace(WHITESPACE, ' ').replace(LEADING_ARTICLE, '')
}
