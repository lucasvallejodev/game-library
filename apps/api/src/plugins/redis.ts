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

  await redis.connect()

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
