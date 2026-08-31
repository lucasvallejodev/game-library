import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis'
import type { FastifyInstance } from 'fastify'

import { parseEnv } from '../../src/env.js'
import { buildServer } from '../../src/server.js'

export interface TestServer {
  app: FastifyInstance
  postgres: StartedPostgreSqlContainer
  redis: StartedRedisContainer
  stop: () => Promise<void>
}

/**
 * Boot the real server against throwaway Postgres and Redis containers.
 *
 * Deliberately the real `buildServer` with real dependencies rather than
 * mocks: the point of this suite is to prove the wiring — plugin order,
 * readiness probes, error mapping — which mocks would paper over.
 */
export async function startTestServer(): Promise<TestServer> {
  const [postgres, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine').start(),
    new RedisContainer('redis:7-alpine').start(),
  ])

  const env = parseEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    WEB_ORIGIN: 'http://localhost:3000',
    DATABASE_URL: postgres.getConnectionUri(),
    REDIS_URL: redis.getConnectionUrl(),
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:4000',
  })

  const app = await buildServer(env)

  return {
    app,
    postgres,
    redis,
    stop: async () => {
      await app.close()
      await Promise.all([postgres.stop(), redis.stop()])
    },
  }
}
