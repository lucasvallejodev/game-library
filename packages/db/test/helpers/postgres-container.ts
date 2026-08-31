import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'

import { createDatabase, type Database } from '../../src/client.js'
import { runMigrations } from '../../src/migrate.js'

export interface TestDatabase {
  db: Database
  url: string
  /** Raw tagged-template client, for schema introspection SQL. */
  sql: ReturnType<typeof createDatabase>['client']
  stop: () => Promise<void>
}

/**
 * Start a throwaway Postgres and apply every migration from zero.
 *
 * Migrating from scratch on each run is the point: it means the migration
 * chain stays runnable from an empty database, which is the property that
 * matters when rebuilding the stack. A migration that does not apply cleanly
 * fails CI. See docs/database.md §6.
 *
 * Image is pinned to match docker-compose.yml, so tests exercise the same
 * Postgres version as development.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:16-alpine',
  ).start()

  const url = container.getConnectionUri()

  await runMigrations(url)

  const { db, client, close } = createDatabase({ url, max: 5 })

  return {
    db,
    url,
    sql: client,
    stop: async () => {
      await close()
      await container.stop()
    },
  }
}
