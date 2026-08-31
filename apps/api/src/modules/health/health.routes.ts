import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

const dependencySchema = z.object({
  database: z.boolean(),
  redis: z.boolean(),
})

const liveSchema = z.object({
  status: z.literal('ok'),
  uptimeSeconds: z.number(),
})

const readySchema = z.object({
  status: z.enum(['ok', 'degraded']),
  dependencies: dependencySchema,
})

/**
 * Liveness and readiness.
 *
 * Split deliberately: `/health` says the process is up (so a supervisor does
 * not restart a healthy process just because Postgres blipped), while
 * `/health/ready` says it can actually serve traffic. Compose and any load
 * balancer should gate on readiness, restart on liveness.
 *
 * Both are unauthenticated and excluded from rate limiting.
 */
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Liveness — is the process running?',
        response: { 200: liveSchema },
      },
    },
    () => ({ status: 'ok' as const, uptimeSeconds: Math.round(process.uptime()) }),
  )

  app.get(
    '/health/ready',
    {
      schema: {
        tags: ['health'],
        summary: 'Readiness — can the process serve traffic?',
        response: { 200: readySchema, 503: readySchema },
      },
    },
    async (_request, reply) => {
      const [database, redis] = await Promise.all([app.dbPing(), app.redisPing()])
      const ok = database && redis

      // 503 so orchestrators stop routing traffic here while a dependency is
      // down, without killing the process.
      return reply.status(ok ? 200 : 503).send({
        status: ok ? ('ok' as const) : ('degraded' as const),
        dependencies: { database, redis },
      })
    },
  )
}
