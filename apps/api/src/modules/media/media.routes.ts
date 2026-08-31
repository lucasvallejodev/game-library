import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { currentUserId } from '../../auth/current-user.js'
import { createMediaRepository } from './media.repository.js'
import { createMediaService, type MediaVariant } from './media.service.js'

const mediaParamsSchema = z.object({
  assetId: z.uuid(),
  /**
   * Present so URLs are human-readable and cacheable. It also selects the
   * variant — `thumb.webp` for the grid, anything else for the full size.
   * It never reaches a storage path: keys are rebuilt from the asset id.
   */
  filename: z.string().max(128),
})

const assetIdParamSchema = z.object({ assetId: z.uuid() })

/**
 * Media is served **through the API**, which checks ownership, rather than by
 * exposing the bucket publicly. See docs/security.md §5.
 */
export const mediaRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createMediaService({
    repo: createMediaRepository(app.db),
    storage: app.storage,
    maxUploadBytes: app.config.MAX_UPLOAD_BYTES,
    log: app.log,
  })

  app.addHook('onRequest', app.requireAuth)

  app.get(
    '/api/media/:assetId/:filename',
    {
      schema: {
        tags: ['media'],
        summary: 'Stream a stored image; `thumb.webp` selects the small variant',
        params: mediaParamsSchema,
      },
    },
    async (request, reply) => {
      const variant: MediaVariant = request.params.filename.startsWith('thumb') ? 'thumb' : 'full'
      const asset = await service.read(currentUserId(request), request.params.assetId, variant)

      // Keys are immutable — a new upload gets a new id — so this can be
      // cached hard. The ETag is the content checksum.
      void reply
        .header('content-type', asset.mimeType)
        .header('cache-control', 'private, max-age=31536000, immutable')
        .header('etag', asset.etag)

      if (request.headers['if-none-match'] === asset.etag) {
        return reply.status(304).send()
      }

      return reply.send(asset.stream)
    },
  )

  app.delete(
    '/api/media/:assetId',
    {
      schema: {
        tags: ['media'],
        summary: 'Delete a stored image and its variants',
        params: assetIdParamSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await service.remove(currentUserId(request), request.params.assetId)
      return reply.status(204).send(null)
    },
  )
}
