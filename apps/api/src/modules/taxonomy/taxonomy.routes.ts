import {
  createGameTypeSchema,
  createGenreSchema,
  createLocationSchema,
  gameTypeListSchema,
  gameTypeSchema,
  genreListSchema,
  genreSchema,
  idParamSchema,
  locationListSchema,
  locationSchema,
  updateGameTypeSchema,
  updateGenreSchema,
  updateLocationSchema,
} from '@game-library/shared/schemas'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { currentUserId } from '../../auth/current-user.js'
import { createTaxonomyRepository } from './taxonomy.repository.js'
import { createTaxonomyService } from './taxonomy.service.js'

/**
 * HTTP for locations, game types and genres.
 *
 * Routes do exactly three things: declare a schema, pull the acting user from
 * the session, and translate the service result into a status code. No
 * business logic, and no repository imports. See docs/architecture.md §5.
 *
 * `userId` always comes from `request.user`, never from a parameter — accepting
 * one would be an authorization bypass waiting to happen.
 */
export const taxonomyRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createTaxonomyService(createTaxonomyRepository(app.db))

  /**
   * Every route here requires a session, enforced at `onRequest` rather than
   * `preHandler`. Fastify validates the body *before* preHandler runs, so an
   * anonymous POST with a bad payload would answer 422 and disclose the route's
   * schema. Rejecting at onRequest means anonymous callers only ever see 401.
   */
  app.addHook('onRequest', app.requireAuth)

  // ── Locations ─────────────────────────────────────────────────────────────

  app.get(
    '/api/locations',
    {
      schema: {
        tags: ['taxonomy'],
        summary: 'List locations with their game counts',
        response: { 200: locationListSchema },
      },
    },
    async (request) => ({ data: await service.locations.list(currentUserId(request)) }),
  )

  app.get(
    '/api/locations/:id',
    {
      schema: {
        tags: ['taxonomy'],
        summary: 'Get one location',
        params: idParamSchema,
        response: { 200: locationSchema },
      },
    },
    async (request) => service.locations.get(currentUserId(request), request.params.id),
  )

  app.post(
    '/api/locations',
    {
      schema: {
        tags: ['taxonomy'],
        summary: 'Create a location',
        body: createLocationSchema,
        response: { 201: locationSchema },
      },
    },
    async (request, reply) => {
      const location = await service.locations.create(currentUserId(request), request.body)
      return reply.status(201).send(location)
    },
  )

  app.patch(
    '/api/locations/:id',
    {
      schema: {
        tags: ['taxonomy'],
        summary: 'Update a location',
        params: idParamSchema,
        body: updateLocationSchema,
        response: { 200: locationSchema },
      },
    },
    async (request) =>
      service.locations.update(currentUserId(request), request.params.id, request.body),
  )

  app.delete(
    '/api/locations/:id',
    {
      schema: {
        tags: ['taxonomy'],
        summary: 'Delete a location; its games are kept',
        params: idParamSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await service.locations.remove(currentUserId(request), request.params.id)
      return reply.status(204).send(null)
    },
  )

  // ── Game types ────────────────────────────────────────────────────────────

  app.get(
    '/api/game-types',
    {
      schema: {
        tags: ['taxonomy'],
        summary: 'List game types with their game counts',
        response: { 200: gameTypeListSchema },
      },
    },
    async (request) => ({ data: await service.gameTypes.list(currentUserId(request)) }),
  )

  app.get(
    '/api/game-types/:id',
    {
      schema: {
        tags: ['taxonomy'],
        summary: 'Get one game type',
        params: idParamSchema,
        response: { 200: gameTypeSchema },
      },
    },
    async (request) => service.gameTypes.get(currentUserId(request), request.params.id),
  )

  app.post(
    '/api/game-types',
    {
      schema: {
        tags: ['taxonomy'],
        summary: 'Create a game type',
        body: createGameTypeSchema,
        response: { 201: gameTypeSchema },
      },
    },
    async (request, reply) => {
      const gameType = await service.gameTypes.create(currentUserId(request), request.body)
      return reply.status(201).send(gameType)
    },
  )

  app.patch(
    '/api/game-types/:id',
    {
      schema: {
        tags: ['taxonomy'],
        summary: 'Rename a game type',
        params: idParamSchema,
        body: updateGameTypeSchema,
        response: { 200: gameTypeSchema },
      },
    },
    async (request) =>
      service.gameTypes.update(currentUserId(request), request.params.id, request.body),
  )

  app.delete(
    '/api/game-types/:id',
    {
      schema: {
        tags: ['taxonomy'],
        summary: 'Delete a game type; affected games keep existing untyped',
        params: idParamSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await service.gameTypes.remove(currentUserId(request), request.params.id)
      return reply.status(204).send(null)
    },
  )

  // ── Genres ────────────────────────────────────────────────────────────────

  app.get(
    '/api/genres',
    {
      schema: {
        tags: ['taxonomy'],
        summary: 'List genres with their game counts',
        response: { 200: genreListSchema },
      },
    },
    async (request) => ({ data: await service.genres.list(currentUserId(request)) }),
  )

  app.get(
    '/api/genres/:id',
    {
      schema: {
        tags: ['taxonomy'],
        summary: 'Get one genre',
        params: idParamSchema,
        response: { 200: genreSchema },
      },
    },
    async (request) => service.genres.get(currentUserId(request), request.params.id),
  )

  app.post(
    '/api/genres',
    {
      schema: {
        tags: ['taxonomy'],
        summary: 'Create a genre',
        body: createGenreSchema,
        response: { 201: genreSchema },
      },
    },
    async (request, reply) => {
      const genre = await service.genres.create(currentUserId(request), request.body)
      return reply.status(201).send(genre)
    },
  )

  app.patch(
    '/api/genres/:id',
    {
      schema: {
        tags: ['taxonomy'],
        summary: 'Rename a genre',
        params: idParamSchema,
        body: updateGenreSchema,
        response: { 200: genreSchema },
      },
    },
    async (request) =>
      service.genres.update(currentUserId(request), request.params.id, request.body),
  )

  app.delete(
    '/api/genres/:id',
    {
      schema: {
        tags: ['taxonomy'],
        summary: 'Delete a genre; only its links to games are removed',
        params: idParamSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await service.genres.remove(currentUserId(request), request.params.id)
      return reply.status(204).send(null)
    },
  )
}
