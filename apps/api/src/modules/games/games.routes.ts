import {
  createGameSchema,
  gameDetailSchema,
  gameListQuerySchema,
  gameListSchema,
  idParamSchema,
  updateGameSchema,
} from '@game-library/shared/schemas'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { currentUserId } from '../../auth/current-user.js'
import { ValidationError } from '../../errors.js'
import { createMediaRepository } from '../media/media.repository.js'
import { createMediaService } from '../media/media.service.js'
import { createIgdbService } from '../igdb/igdb.service.js'
import { createGamesRepository } from './games.repository.js'
import { createGamesService } from './games.service.js'

export const gamesRoutes: FastifyPluginAsyncZod = async (app) => {
  const media = createMediaService({
    repo: createMediaRepository(app.db),
    storage: app.storage,
    maxUploadBytes: app.config.MAX_UPLOAD_BYTES,
    log: app.log,
  })
  const service = createGamesService({
    repo: createGamesRepository(app.db),
    db: app.db,
    log: app.log,
    igdb: app.igdb ? createIgdbService(app.db, app.igdb) : null,
    media,
  })

  app.addHook('onRequest', app.requireAuth)

  app.get(
    '/api/games',
    {
      schema: {
        tags: ['games'],
        summary: 'List the library, filtered by name, location, type and genre',
        description:
          'Different filter types combine with AND; repeated values of the same filter combine with OR — so "a Strategy game, on GOG or Steam" behaves as expected.',
        querystring: gameListQuerySchema,
        response: { 200: gameListSchema },
      },
    },
    async (request) => service.list(currentUserId(request), request.query),
  )

  app.get(
    '/api/games/:id',
    {
      schema: {
        tags: ['games'],
        summary: 'Get one game',
        params: idParamSchema,
        response: { 200: gameDetailSchema },
      },
    },
    async (request) => service.get(currentUserId(request), request.params.id),
  )

  app.post(
    '/api/games',
    {
      schema: {
        tags: ['games'],
        summary: 'Add a game to the library',
        description:
          'Supplying an igdbId that is already in the library returns 409 with the existing game in `details` — the duplicate-purchase guard.',
        body: createGameSchema,
        response: { 201: gameDetailSchema },
      },
    },
    async (request, reply) => {
      const game = await service.create(currentUserId(request), request.body)
      return reply.status(201).send(game)
    },
  )

  app.patch(
    '/api/games/:id',
    {
      schema: {
        tags: ['games'],
        summary: 'Update a game; locationIds and genreIds replace the whole set',
        params: idParamSchema,
        body: updateGameSchema,
        response: { 200: gameDetailSchema },
      },
    },
    async (request) => service.update(currentUserId(request), request.params.id, request.body),
  )

  app.delete(
    '/api/games/:id',
    {
      schema: {
        tags: ['games'],
        summary: 'Remove a game from the library',
        params: idParamSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await service.remove(currentUserId(request), request.params.id)
      return reply.status(204).send(null)
    },
  )

  app.post(
    '/api/games/:id/refresh-igdb',
    {
      schema: {
        tags: ['games'],
        summary: 'Re-pull IGDB metadata; never overwrites notes, locations or type',
        params: idParamSchema,
        response: { 200: gameDetailSchema },
      },
    },
    async (request) => service.refreshFromIgdb(currentUserId(request), request.params.id),
  )

  app.post(
    '/api/games/:id/cover',
    {
      schema: {
        tags: ['games'],
        summary: 'Upload a cover image (multipart, field `file`)',
        params: idParamSchema,
        consumes: ['multipart/form-data'],
        response: { 200: gameDetailSchema },
      },
    },
    async (request) => {
      const userId = currentUserId(request)

      // Prove ownership before spending CPU on image processing.
      await service.get(userId, request.params.id)

      const upload = await request.file()
      if (!upload) {
        throw new ValidationError('Expected a multipart upload with a `file` field')
      }

      const asset = await media.storeImage(userId, await upload.toBuffer(), { source: 'upload' })
      return service.setCover(userId, request.params.id, asset.id)
    },
  )
}
