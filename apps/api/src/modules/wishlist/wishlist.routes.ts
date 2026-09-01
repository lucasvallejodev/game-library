import {
  createWishlistItemSchema,
  duplicateCheckQuerySchema,
  duplicateCheckSchema,
  gameDetailSchema,
  idParamSchema,
  promoteWishlistItemSchema,
  updateWishlistItemSchema,
  wishlistItemSchema,
  wishlistListQuerySchema,
  wishlistListSchema,
} from '@game-library/shared/schemas'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { currentUserId } from '../../auth/current-user.js'
import { ValidationError } from '../../errors.js'
import { createGamesRepository } from '../games/games.repository.js'
import { createGamesService } from '../games/games.service.js'
import { createIgdbService } from '../igdb/igdb.service.js'
import { createMediaRepository } from '../media/media.repository.js'
import { createMediaService } from '../media/media.service.js'
import { createWishlistRepository } from './wishlist.repository.js'
import { createWishlistService } from './wishlist.service.js'

export const wishlistRoutes: FastifyPluginAsyncZod = async (app) => {
  const media = createMediaService({
    repo: createMediaRepository(app.db),
    storage: app.storage,
    maxUploadBytes: app.config.MAX_UPLOAD_BYTES,
    log: app.log,
  })
  const igdb = app.igdb ? createIgdbService(app.db, app.igdb) : null

  const service = createWishlistService({
    repo: createWishlistRepository(app.db),
    db: app.db,
    log: app.log,
    igdb,
    media,
  })

  const gamesService = createGamesService({
    repo: createGamesRepository(app.db),
    db: app.db,
    log: app.log,
    igdb,
    media,
  })

  app.addHook('onRequest', app.requireAuth)

  /**
   * The duplicate-purchase guard.
   *
   * Registered before `/:id` so "check" is never captured as an id.
   */
  app.get(
    '/api/wishlist/check',
    {
      schema: {
        tags: ['wishlist'],
        summary: 'Do I already own or want this IGDB title?',
        querystring: duplicateCheckQuerySchema,
        response: { 200: duplicateCheckSchema },
      },
    },
    async (request) => service.checkDuplicate(currentUserId(request), request.query.igdbId),
  )

  app.get(
    '/api/wishlist',
    {
      schema: {
        tags: ['wishlist'],
        summary: 'List the wishlist',
        querystring: wishlistListQuerySchema,
        response: { 200: wishlistListSchema },
      },
    },
    async (request) => service.list(currentUserId(request), request.query),
  )

  app.get(
    '/api/wishlist/:id',
    {
      schema: {
        tags: ['wishlist'],
        summary: 'Get one wishlist item',
        params: idParamSchema,
        response: { 200: wishlistItemSchema },
      },
    },
    async (request) => service.get(currentUserId(request), request.params.id),
  )

  app.post(
    '/api/wishlist',
    {
      schema: {
        tags: ['wishlist'],
        summary: 'Add a game you want',
        description:
          'Returns 409 if the title is already in your library or already wishlisted, with the existing record in `details`.',
        body: createWishlistItemSchema,
        response: { 201: wishlistItemSchema },
      },
    },
    async (request, reply) => {
      const item = await service.create(currentUserId(request), request.body)
      return reply.status(201).send(item)
    },
  )

  app.patch(
    '/api/wishlist/:id',
    {
      schema: {
        tags: ['wishlist'],
        summary: 'Update a wishlist item',
        params: idParamSchema,
        body: updateWishlistItemSchema,
        response: { 200: wishlistItemSchema },
      },
    },
    async (request) => service.update(currentUserId(request), request.params.id, request.body),
  )

  app.delete(
    '/api/wishlist/:id',
    {
      schema: {
        tags: ['wishlist'],
        summary: 'Remove a wishlist item',
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
    '/api/wishlist/:id/promote',
    {
      schema: {
        tags: ['wishlist'],
        summary: 'Bought it — move this item into the library',
        params: idParamSchema,
        body: promoteWishlistItemSchema,
        response: { 201: gameDetailSchema },
      },
    },
    async (request, reply) => {
      const userId = currentUserId(request)
      const { gameId } = await service.promote(userId, request.params.id, {
        locationIds: request.body.locationIds ?? [],
        acquiredAt: request.body.acquiredAt,
      })
      // Return the created game, so the UI can navigate straight to it.
      return reply.status(201).send(await gamesService.get(userId, gameId))
    },
  )

  app.post(
    '/api/wishlist/:id/cover',
    {
      schema: {
        tags: ['wishlist'],
        summary: 'Upload a cover image (multipart, field `file`)',
        params: idParamSchema,
        consumes: ['multipart/form-data'],
        response: { 200: wishlistItemSchema },
      },
    },
    async (request) => {
      const userId = currentUserId(request)
      // Prove ownership before spending CPU on image processing.
      await service.get(userId, request.params.id)

      const upload = await request.file()
      if (!upload) throw new ValidationError('Expected a multipart upload with a `file` field')

      const asset = await media.storeImage(userId, await upload.toBuffer(), { source: 'upload' })
      return service.setCover(userId, request.params.id, asset.id)
    },
  )
}
