import {
  char,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { newId } from '../id.js'
import { users } from './auth.js'

/**
 * Which driver physically holds an object's bytes.
 *
 * Recorded per asset, not inferred from current config at read time. This is
 * what makes the S3→local fallback safe: objects written while MinIO was
 * unreachable stay readable once it comes back. See docs/architecture.md §7.
 */
export const storageDriverEnum = pgEnum('storage_driver', ['s3', 'local'])

/** Where the bytes came from — mirrored from IGDB, or uploaded by the user. */
export const assetSourceEnum = pgEnum('asset_source', ['igdb', 'upload'])

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    storageDriver: storageDriverEnum('storage_driver').notNull(),
    /** Always server-generated: users/{userId}/covers/{uuid}.webp */
    objectKey: text('object_key').notNull(),
    /** Null for the local driver. */
    bucket: text('bucket'),

    mimeType: text('mime_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    width: integer('width'),
    height: integer('height'),
    /** Lets a repeated IGDB mirror reuse bytes we already hold. */
    checksumSha256: char('checksum_sha256', { length: 64 }).notNull(),

    source: assetSourceEnum('source').notNull(),
    /** Provenance for mirrored covers; null for uploads. */
    sourceUrl: text('source_url'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('media_assets_user_idx').on(t.userId),
    index('media_assets_checksum_idx').on(t.userId, t.checksumSha256),
    // A key is only unique within its driver — the same logical object may
    // exist locally and in S3 during a fallback reconciliation.
    unique('media_assets_driver_key_uniq').on(t.storageDriver, t.objectKey),
  ],
)
