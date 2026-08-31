import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

import { createAuth, type Auth } from '../auth/auth.js'
import { UnauthenticatedError } from '../errors.js'

export interface AuthUser {
  id: string
  email: string
  name: string
  emailVerified: boolean
  image?: string | null
}

export interface AuthSession {
  id: string
  userId: string
  expiresAt: Date
}

declare module 'fastify' {
  interface FastifyInstance {
    auth: Auth
    /** preHandler that rejects anonymous requests with 401. */
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }

  interface FastifyRequest {
    /** Populated on every request; null when not signed in. */
    user: AuthUser | null
    session: AuthSession | null
  }
}

/** Convert a Fastify request into the Web Request that Better Auth expects. */
function toWebRequest(request: FastifyRequest): Request {
  const url = new URL(request.url, `${request.protocol}://${request.hostname}`)

  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v)
    } else if (value !== undefined) {
      headers.append(key, value)
    }
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'

  return new Request(url, {
    method: request.method,
    headers,
    ...(hasBody && request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
  })
}

async function authPlugin(app: FastifyInstance): Promise<void> {
  const auth = createAuth(app.db, app.config, app.log)
  app.decorate('auth', auth)

  // Always defined so handlers never see `undefined` vs `null` ambiguity.
  app.decorateRequest('user', null)
  app.decorateRequest('session', null)

  /**
   * Resolve the session on every request.
   *
   * Done once here rather than per-route so `request.user` is uniformly
   * available, and so an expired or revoked session is recognised everywhere.
   */
  app.addHook('onRequest', async (request) => {
    try {
      const result = await auth.api.getSession({ headers: toWebRequest(request).headers })
      if (result) {
        request.user = result.user
        request.session = result.session
      }
    } catch (error) {
      // A malformed or expired cookie is an anonymous request, not a 500.
      request.log.debug({ err: error }, 'session resolution failed; treating as anonymous')
    }
  })

  app.decorate('requireAuth', async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.user) {
      throw new UnauthenticatedError()
    }
    await Promise.resolve()
  })

  /**
   * Mount Better Auth's own routes under /api/auth/*.
   *
   * Better Auth owns sign-up, sign-in, sign-out, OAuth callbacks and password
   * reset; we do not hand-write them. See docs/api-endpoints.md.
   */
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    // Better Auth performs its own validation and rate limiting on these.
    config: { rateLimit: false },
    handler: async (request, reply) => {
      const response = await auth.handler(toWebRequest(request))

      void reply.status(response.status)
      response.headers.forEach((value, key) => {
        // set-cookie must be appended, not set: sign-in emits more than one.
        if (key.toLowerCase() === 'set-cookie') {
          void reply.header('set-cookie', value)
        } else {
          void reply.header(key, value)
        }
      })

      return response.text()
    },
  })
}

export default fp(authPlugin, { name: 'auth', dependencies: ['config', 'db'] })
