import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { jsonSchemaTransform } from 'fastify-type-provider-zod'

/**
 * OpenAPI docs at /api/docs.
 *
 * The spec is generated from the very Zod schemas that validate requests, so
 * it cannot drift from the implementation the way a hand-written spec does.
 */
async function swaggerPlugin(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Game Library API',
        description:
          'Track games owned across platforms and storage locations, with a wishlist that prevents duplicate purchases.',
        version: '0.1.0',
      },
      servers: [{ url: `http://localhost:${String(app.config.API_PORT)}` }],
      tags: [
        { name: 'health', description: 'Liveness and readiness' },
        { name: 'games', description: 'The library' },
        { name: 'wishlist', description: 'Wanted, not owned' },
        { name: 'taxonomy', description: 'Locations, game types, genres' },
      ],
      components: {
        securitySchemes: {
          sessionCookie: {
            type: 'apiKey',
            in: 'cookie',
            name: 'better-auth.session_token',
            description: 'Session cookie issued by Better Auth. No bearer tokens.',
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  })

  await app.register(swaggerUi, {
    routePrefix: '/api/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  })
}

export default fp(swaggerPlugin, { name: 'swagger', dependencies: ['config'] })
