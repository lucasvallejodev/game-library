import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

import { migrate } from 'drizzle-orm/postgres-js/migrator'

import { createDatabase } from './client.js'

const MIGRATIONS_FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations')

/**
 * Apply every pending migration.
 *
 * Deliberately a standalone runner rather than something the API calls on
 * boot: migrations run as a one-shot container that must exit 0 before the API
 * starts, so two replicas can never race to migrate the same database.
 * See docs/architecture.md §9.
 */
export async function runMigrations(databaseUrl: string, migrationsFolder?: string): Promise<void> {
  // max: 1 — a migration must run on a single connection, in order.
  const { db, close } = createDatabase({ url: databaseUrl, max: 1 })

  try {
    // The folder is overridable because the default is resolved relative to
    // this file, which does not survive bundling for the production image.
    await migrate(db, { migrationsFolder: migrationsFolder ?? MIGRATIONS_FOLDER })
  } finally {
    await close()
  }
}

/** CLI entrypoint: `pnpm db:migrate`. */
async function main(): Promise<void> {
  const { config } = await import('dotenv')
  config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'), quiet: true })

  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env first.')
    process.exit(1)
  }

  console.warn(`Applying migrations from ${MIGRATIONS_FOLDER}`)
  await runMigrations(url)
  console.warn('Migrations applied.')
}

/**
 * Only run when invoked directly, not when imported by tests.
 *
 * pathToFileURL is required rather than string-building a `file://` URL: on
 * Windows argv[1] is `C:\path\to\migrate.ts` while import.meta.url is
 * `file:///C:/path/to/migrate.ts`. A hand-built comparison silently never
 * matches, so the runner exits 0 having applied nothing — which would let the
 * one-shot migrate container report success and the API start against an
 * empty database.
 */
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  await main()
}
