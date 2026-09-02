import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { Redis } from 'ioredis'

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis
    /** True when Redis answers PING. Used by /health/ready. */
    redisPing: () => Promise<boolean>
  }
}

/**
 * Redis holds the Twitch app token, the IGDB response cache and rate-limit
 * counters — see docs/architecture.md §6. One shared client for the process.
 */
async function redisPlugin(app: FastifyInstance): Promise<void> {
  const redis = new Redis(app.config.REDIS_URL, {
    // Fastify should surface a clear startup failure rather than queueing
    // commands forever against a Redis that never appears.
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  })

  redis.on('error', (error: Error) => {
    app.log.error({ err: error }, 'redis error')
  })

  /**
   * Retry the initial connection before giving up.
   *
   * Redis is usually still accepting its first connections when the API boots
   * — `docker compose up -d` and `pnpm dev` race, and in production a restart
   * brings the API back before Redis is ready. A single `connect()` turned
   * that ordinary race into a permanent, silent death of the process.
   *
   * Bounded on purpose: a genuinely wrong REDIS_URL should still fail the boot
   * loudly rather than retry forever.
   */
  const attempts = 10
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await redis.connect()
      break
    } catch (error) {
      if (attempt === attempts) {
        app.log.fatal({ err: error }, `Redis unreachable after ${String(attempts)} attempts`)
        throw error
      }
      app.log.warn(
        { attempt, of: attempts },
        'Redis not ready yet; retrying the initial connection',
      )
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  app.decorate('redis', redis)
  app.decorate('redisPing', async () => {
    try {
      // ioredis types this as the literal 'PONG', so comparing it is dead
      // code; a failure surfaces as a throw, which is what we catch.
      await redis.ping()
      return true
    } catch (error) {
      app.log.error({ err: error }, 'redis ping failed')
      return false
    }
  })

  app.addHook('onClose', async () => {
    await redis.quit()
  })
}

export default fp(redisPlugin, { name: 'redis' })
