import { type Database, schema } from '@game-library/db'
import { and, eq } from 'drizzle-orm'

import type { StorageDriverName } from '../../storage/types.js'

export interface MediaAssetRow {
  id: string
  storageDriver: StorageDriverName
  objectKey: string
  bucket: string | null
  mimeType: string
  byteSize: number
  width: number | null
  height: number | null
  checksumSha256: string
  source: 'igdb' | 'upload'
  sourceUrl: string | null
}

export interface InsertMediaAsset {
  /**
   * Supplied by the caller, not defaulted by the database: the object keys are
   * built from this id, so the row and the stored bytes must share it.
   */
  id: string
  storageDriver: StorageDriverName
  objectKey: string
  bucket: string | null
  mimeType: string
  byteSize: number
  width: number
  height: number
  checksumSha256: string
  source: 'igdb' | 'upload'
  sourceUrl?: string | null
}

export interface MediaRepository {
  insert: (userId: string, values: InsertMediaAsset) => Promise<string>
  findById: (userId: string, id: string) => Promise<MediaAssetRow | null>
  findByChecksum: (userId: string, checksum: string) => Promise<MediaAssetRow | null>
  remove: (userId: string, id: string) => Promise<MediaAssetRow | null>
}

/** `userId` first on every method — see AGENTS.md rule 1. */
export function createMediaRepository(db: Database): MediaRepository {
  const { mediaAssets } = schema

  const columns = {
    id: mediaAssets.id,
    storageDriver: mediaAssets.storageDriver,
    objectKey: mediaAssets.objectKey,
    bucket: mediaAssets.bucket,
    mimeType: mediaAssets.mimeType,
    byteSize: mediaAssets.byteSize,
    width: mediaAssets.width,
    height: mediaAssets.height,
    checksumSha256: mediaAssets.checksumSha256,
    source: mediaAssets.source,
    sourceUrl: mediaAssets.sourceUrl,
  }

  return {
    insert: async (userId, values) => {
      const rows = await db
        .insert(mediaAssets)
        .values({ userId, ...values })
        .returning({ id: mediaAssets.id })
      const id = rows[0]?.id
      if (!id) throw new Error('media asset insert returned no id')
      return id
    },

    findById: async (userId, id) => {
      const rows = await db
        .select(columns)
        .from(mediaAssets)
        .where(and(eq(mediaAssets.userId, userId), eq(mediaAssets.id, id)))
      return rows[0] ?? null
    },

    findByChecksum: async (userId, checksum) => {
      const rows = await db
        .select(columns)
        .from(mediaAssets)
        .where(and(eq(mediaAssets.userId, userId), eq(mediaAssets.checksumSha256, checksum)))
      return rows[0] ?? null
    },

    remove: async (userId, id) => {
      const rows = await db
        .delete(mediaAssets)
        .where(and(eq(mediaAssets.userId, userId), eq(mediaAssets.id, id)))
        .returning(columns)
      return rows[0] ?? null
    },
  }
}
