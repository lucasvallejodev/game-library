import type { Readable } from 'node:stream'

import { newId } from '@game-library/db'
import type { FastifyBaseLogger } from 'fastify'

import { NotFoundError } from '../../errors.js'
import { processImage } from '../../storage/image-pipeline.js'
import type { StorageService } from '../../storage/storage.service.js'
import { ObjectNotFoundError, type StorageDriverName } from '../../storage/types.js'
import type { MediaRepository } from './media.repository.js'

export type MediaVariant = 'full' | 'thumb'

export interface StoredAsset {
  id: string
  driver: StorageDriverName
  width: number
  height: number
  byteSize: number
}

export interface MediaStream {
  stream: Readable
  mimeType: string
  etag: string
}

export interface MediaService {
  storeImage: (
    userId: string,
    input: Buffer,
    meta: { source: 'igdb' | 'upload'; sourceUrl?: string },
  ) => Promise<StoredAsset>
  read: (userId: string, assetId: string, variant: MediaVariant) => Promise<MediaStream>
  remove: (userId: string, assetId: string) => Promise<void>
}

/**
 * Object keys are always server-generated. A client-supplied filename never
 * enters a storage path — that is how path traversal gets in.
 * See AGENTS.md rule 8.
 */
function buildKey(userId: string, id: string, variant: MediaVariant): string {
  const suffix = variant === 'thumb' ? '@thumb' : ''
  return `users/${userId}/covers/${id}${suffix}.webp`
}

export interface MediaServiceDeps {
  repo: MediaRepository
  storage: StorageService
  maxUploadBytes: number
  log: FastifyBaseLogger
}

export function createMediaService(deps: MediaServiceDeps): MediaService {
  const { repo, storage, maxUploadBytes, log } = deps

  return {
    storeImage: async (userId, input, meta) => {
      const processed = await processImage(input, { maxBytes: maxUploadBytes })
      const id = newId()

      const fullKey = buildKey(userId, id, 'full')
      const thumbKey = buildKey(userId, id, 'thumb')

      // Both variants go through the same façade, so both honour the fallback.
      const [stored] = await Promise.all([
        storage.put(fullKey, processed.full.buffer, processed.mimeType),
        storage.put(thumbKey, processed.thumb.buffer, processed.mimeType),
      ])

      if (stored.driver !== storage.primary) {
        log.warn(
          { assetId: id, driver: stored.driver },
          'asset stored on the fallback driver; reconcile when the primary recovers',
        )
      }

      await repo.insert(userId, {
        id,
        storageDriver: stored.driver,
        objectKey: fullKey,
        bucket: stored.bucket,
        mimeType: processed.mimeType,
        byteSize: processed.full.buffer.byteLength,
        width: processed.full.width,
        height: processed.full.height,
        checksumSha256: processed.checksum,
        source: meta.source,
        sourceUrl: meta.sourceUrl ?? null,
      })

      return {
        id,
        driver: stored.driver,
        width: processed.full.width,
        height: processed.full.height,
        byteSize: processed.full.buffer.byteLength,
      }
    },

    read: async (userId, assetId, variant) => {
      const asset = await repo.findById(userId, assetId)
      // Another user's asset is indistinguishable from a missing one.
      if (!asset) throw new NotFoundError('Media asset')

      const key =
        variant === 'thumb' ? asset.objectKey.replace(/\.webp$/, '@thumb.webp') : asset.objectKey

      try {
        // Resolved from the *recorded* driver, not the current primary.
        const stream = await storage.get(asset.storageDriver, key)
        return { stream, mimeType: asset.mimeType, etag: `"${asset.checksumSha256}"` }
      } catch (error) {
        if (error instanceof ObjectNotFoundError) throw new NotFoundError('Media asset')
        throw error
      }
    },

    remove: async (userId, assetId) => {
      const asset = await repo.remove(userId, assetId)
      if (!asset) throw new NotFoundError('Media asset')

      // Bytes go after the row: an orphaned object wastes space, an orphaned
      // row breaks every page that references it.
      await Promise.all([
        storage.delete(asset.storageDriver, asset.objectKey),
        storage.delete(asset.storageDriver, asset.objectKey.replace(/\.webp$/, '@thumb.webp')),
      ])
    },
  }
}
