import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

import type { Env } from '../env.js'

declare module 'fastify' {
  interface FastifyInstance {
    config: Env
  }
}

/**
 * Makes the validated environment available as `app.config`.
 *
 * Env is parsed once at the edge (entrypoint or test harness) and injected
 * here, so nothing deeper in the app reads `process.env` directly.
 */
function configPlugin(app: FastifyInstance, opts: { env: Env }): void {
  app.decorate('config', opts.env)
}

export default fp(configPlugin, { name: 'config' })
