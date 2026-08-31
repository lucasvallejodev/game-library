import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

/**
 * Transport-level hardening: headers, CORS allowlist and rate limiting.
 * See docs/security.md §2 and §7.
 */
async function securityPlugin(app: FastifyInstance): Promise<void> {
  await app.register(helmet, {
    // The API serves JSON and (later) media, never an app shell, so it should
    // never be framed and should never be sniffed.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  })

  await app.register(cors, {
    // Explicit allowlist, never `*`. Credentials are cookies, and `*` is
    // invalid with credentials anyway — a reflected-origin handler is the
    // usual self-inflicted hole here.
    origin: [app.config.WEB_ORIGIN],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86_400,
  })

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    // Counters live in Redis so limits hold across API replicas.
    redis: app.redis,
    // Keep one namespace so the limiter cannot collide with the IGDB cache.
    nameSpace: 'ratelimit:',
    // Health checks are polled by the container runtime; never throttle them.
    allowList: (request) => request.url.startsWith('/health'),
  })
}

export default fp(securityPlugin, { name: 'security', dependencies: ['config', 'redis'] })
