import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis'
import type { FastifyInstance } from 'fastify'

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runMigrations } from '@game-library/db'

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
export interface StorageOverrides {
  STORAGE_DRIVER?: 's3' | 'local'
  STORAGE_LOCAL_PATH?: string
  S3_ENDPOINT?: string
  S3_BUCKET?: string
  S3_ACCESS_KEY?: string
  S3_SECRET_KEY?: string
  MAX_UPLOAD_BYTES?: string
}

export interface TestServerOptions {
  /**
   * Apply migrations before building the server. Required by anything that
   * touches application tables — auth (it seeds), taxonomy, games.
   */
  migrate?: boolean
  /** Point storage at a test MinIO, or force the local driver. */
  storage?: StorageOverrides
}

export async function startTestServer(options: TestServerOptions = {}): Promise<TestServer> {
  const [postgres, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine').start(),
    new RedisContainer('redis:7-alpine').start(),
  ])

  const databaseUrl = postgres.getConnectionUri()

  if (options.migrate) {
    await runMigrations(databaseUrl)
  }

  const env = parseEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    WEB_ORIGIN: 'http://localhost:3000',
    DATABASE_URL: databaseUrl,
    REDIS_URL: redis.getConnectionUrl(),
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:4000',
    // Default to local disk so suites that do not care about storage need no
    // MinIO container.
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_PATH: await mkdtemp(join(tmpdir(), 'game-library-storage-')),
    ...options.storage,
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
