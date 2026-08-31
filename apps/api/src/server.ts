import Fastify, { type FastifyInstance } from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'

import type { Env } from './env.js'
import { healthRoutes } from './modules/health/health.routes.js'
import { taxonomyRoutes } from './modules/taxonomy/taxonomy.routes.js'
import authPlugin from './plugins/auth.js'
import configPlugin from './plugins/config.js'
import dbPlugin from './plugins/db.js'
import errorsPlugin from './plugins/errors.js'
import redisPlugin from './plugins/redis.js'
import securityPlugin from './plugins/security.js'
import swaggerPlugin from './plugins/swagger.js'

/**
 * Fields that must never reach the logs — tokens, credentials, session
 * cookies. See docs/security.md §4 rule 7.
 *
 * Each name is listed twice on purpose: pino treats `*.password` as "a
 * `password` key one level down", so a bare top-level `password` would sail
 * straight through without the unprefixed entry as well.
 */
const SECRET_FIELDS = [
  'password',
  'client_secret',
  'clientSecret',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'BETTER_AUTH_SECRET',
  'TWITCH_CLIENT_SECRET',
] as const

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  ...SECRET_FIELDS.flatMap((field) => [field, `*.${field}`]),
]

/**
 * Build the Fastify instance without starting it.
 *
 * Separated from `listen()` so tests can drive the app in-process with
 * `app.inject()` — no ports, no races. See docs/architecture.md §3.
 */
export async function buildServer(env: Env): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      ...(env.NODE_ENV === 'development'
        ? {
            transport: {
              target: 'pino-pretty',
              options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
            },
          }
        : {}),
    },
    // Trust the reverse proxy for client IPs, which rate limiting depends on.
    trustProxy: env.NODE_ENV === 'production',
    // 1 MB globally; the upload route raises its own limit in increment 7.
    bodyLimit: 1_048_576,
    // No disableRequestLogging: it is deprecated in Fastify 5, and tests run at
    // LOG_LEVEL=error, which already suppresses per-request info logs.
  })

  // Zod drives both request validation and response serialization.
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Order matters: config and infrastructure first, then anything that reads
  // them (security needs redis for its rate-limit store).
  await app.register(configPlugin, { env })
  await app.register(errorsPlugin)
  await app.register(dbPlugin)
  await app.register(redisPlugin)
  await app.register(securityPlugin)
  await app.register(authPlugin)
  await app.register(swaggerPlugin)

  await app.register(healthRoutes)
  await app.register(taxonomyRoutes)

  // Deliberately NOT calling app.ready() here: readying freezes the route
  // table, and tests need to register throwaway routes (e.g. to exercise
  // requireAuth) before the first request. listen() and inject() both ready
  // the instance themselves, so nothing is lost.
  return app
}
