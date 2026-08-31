import { createDatabase, type Database } from '@game-library/db'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    db: Database
    /** True when Postgres answers a trivial query. Used by /health/ready. */
    dbPing: () => Promise<boolean>
  }
}

/**
 * The database handle. This is the only plugin that opens a Postgres
 * connection — nothing else in the process talks to the database directly.
 */
function dbPlugin(app: FastifyInstance): void {
  const { db, client, close } = createDatabase({
    url: app.config.DATABASE_URL,
    debug: app.config.LOG_LEVEL === 'trace',
  })

  app.decorate('db', db)
  app.decorate('dbPing', async () => {
    try {
      await client`SELECT 1`
      return true
    } catch (error) {
      app.log.error({ err: error }, 'database ping failed')
      return false
    }
  })

  app.addHook('onClose', async () => {
    await close()
  })
}

export default fp(dbPlugin, { name: 'db' })
