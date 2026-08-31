import type { Readable } from 'node:stream'

import { newId } from '@game-library/db'
import type { FastifyBaseLogger } from 'fastify'

import { ExternalServiceError, NotFoundError, ValidationError } from '../../errors.js'
import { IGDB_IMAGE_HOST } from '../../igdb/igdb.mapper.js'
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
  /** Mirror a cover from IGDB. Only the IGDB image host may be fetched. */
  storeFromUrl: (userId: string, url: string) => Promise<StoredAsset>
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

  const service: MediaService = {
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

    storeFromUrl: async (userId, url) => {
      /**
       * SSRF guard. Mirroring means the server fetches a URL, so without a
       * strict host allowlist "fetch this cover" becomes a probe against the
       * internal network — cloud metadata endpoints, Redis, Postgres.
       * Only IGDB's image CDN is reachable. See docs/security.md §5.
       */
      let parsed: URL
      try {
        parsed = new URL(url)
      } catch {
        throw new ValidationError('Cover URL is not a valid URL')
      }

      if (parsed.protocol !== 'https:' || parsed.hostname !== IGDB_IMAGE_HOST) {
        throw new ValidationError(`Cover images may only be fetched from ${IGDB_IMAGE_HOST}`)
      }

      const response = await fetch(parsed, {
        // Never follow a redirect: it is the standard way to escape an
        // allowlist that only checks the initial hostname.
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      })

      if (!response.ok) {
        throw new ExternalServiceError('IGDB', `Cover fetch failed with ${String(response.status)}`)
      }

      const bytes = Buffer.from(await response.arrayBuffer())
      // The same pipeline as an upload: magic bytes, re-encode, EXIF strip.
      return service.storeImage(userId, bytes, { source: 'igdb', sourceUrl: url })
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

  return service
}
