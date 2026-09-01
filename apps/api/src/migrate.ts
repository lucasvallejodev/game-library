import { runMigrations } from '@game-library/db'

import { loadEnv } from './env.js'

/**
 * The one-shot migration entrypoint for the production image.
 *
 * Runs as its own container that must exit 0 before the API starts, so schema
 * changes are deterministic and two API replicas can never race to migrate the
 * same database. See docs/architecture.md §9.
 *
 * MIGRATIONS_DIR is explicit because the bundled output does not sit next to
 * the SQL files the way the source does.
 */
const env = loadEnv()
const folder = process.env.MIGRATIONS_DIR ?? undefined

console.warn(`Applying migrations${folder ? ` from ${folder}` : ''}…`)
await runMigrations(env.DATABASE_URL, folder)
console.warn('Migrations applied.')
