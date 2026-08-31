import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema/index.js'

/** postgres.js emits NOTICE output by default; swallow it unless debugging. */
const ignoreNotices = (): void => undefined

export type Database = ReturnType<typeof createDatabase>['db']

export interface DatabaseOptions {
  /** Postgres connection string. */
  url: string
  /** Max pooled connections. Keep migrations and scripts at 1. */
  max?: number
  /** Log every statement. Useful in tests, noisy everywhere else. */
  debug?: boolean
}

/**
 * Build a Drizzle client plus the underlying connection.
 *
 * Returns both so callers can close the pool deterministically — tests and
 * one-shot scripts must not leave the event loop open.
 */
export function createDatabase({ url, max = 10, debug = false }: DatabaseOptions) {
  const client = postgres(url, {
    max,
    // Fail fast rather than hanging when Postgres is unreachable.
    connect_timeout: 10,
    onnotice: debug ? undefined : ignoreNotices,
  })

  const db = drizzle(client, { schema, logger: debug })

  return {
    db,
    client,
    close: async (): Promise<void> => {
      await client.end({ timeout: 5 })
    },
  }
}
