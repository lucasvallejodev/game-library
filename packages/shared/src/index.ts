/**
 * Public surface of @game-library/shared.
 *
 * Everything the API and the web app agree on lives here: Zod schemas derived
 * from the Drizzle tables, the types inferred from them, and pure helpers used
 * on both sides. See docs/architecture.md §3.
 */

export { slugify, sortName } from './text.js'
