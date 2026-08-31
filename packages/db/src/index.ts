/**
 * Public surface of @game-library/db.
 *
 * Only the API imports this — the web app never touches the database.
 * See docs/architecture.md §4.
 */

export { createDatabase, type Database, type DatabaseOptions } from './client.js'
export { newId } from './id.js'
export { runMigrations } from './migrate.js'
export { DEFAULT_GAME_TYPES, DEFAULT_GENRES } from './seed/defaults.js'
export * as schema from './schema/index.js'
