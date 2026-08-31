import {
  igdbGameSchema,
  igdbIdParamSchema,
  igdbSearchQuerySchema,
  igdbSearchResultSchema,
} from '@game-library/shared/schemas'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { currentUserId } from '../../auth/current-user.js'
import { createIgdbService } from './igdb.service.js'

/**
 * The IGDB proxy.
 *
 * Every call requires a session and is rate limited per user, so one account
 * cannot burn the shared application quota. The browser never receives a
 * Twitch token. See docs/security.md §4.
 */
export const igdbRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.requireAuth)

  app.get(
    '/api/igdb/search',
    {
      config: {
        // Stricter than the global 300/min: this route costs an upstream call.
        rateLimit: { max: 30, timeWindow: '1 minute' },
      },
      schema: {
        tags: ['igdb'],
        summary: 'Search IGDB, annotated with what you already own',
        querystring: igdbSearchQuerySchema,
        response: { 200: igdbSearchResultSchema },
      },
    },
    async (request) => {
      const service = createIgdbService(app.db, app.requireIgdb())
      const data = await service.search(
        currentUserId(request),
        request.query.q,
        request.query.limit,
      )
      return { data }
    },
  )

  app.get(
    '/api/igdb/games/:igdbId',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['igdb'],
        summary: 'Full IGDB metadata for one title',
        params: igdbIdParamSchema,
        response: { 200: igdbGameSchema },
      },
    },
    async (request) => {
      const service = createIgdbService(app.db, app.requireIgdb())
      return service.getGame(currentUserId(request), request.params.igdbId)
    },
  )
}
