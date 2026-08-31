import {
  boolean,
  char,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

import { newId } from '../id.js'
import { users } from './auth.js'
import { mediaAssets } from './media.js'

/**
 * Locations, game types and genres are all **per-user rows**, not global
 * lookups. That is what makes "seed new accounts with defaults" work while
 * still letting one user rename `RPG` to `Role-Playing` without affecting
 * anyone else. Uniqueness is therefore always scoped: UNIQUE (user_id, slug).
 * See docs/database.md §1.
 */

/** Where a game lives: GOG, Steam, `WD 4TB External`. */
export const locations = pgTable(
  'locations',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    slug: text('slug').notNull(),
    /**
     * Hex, #RRGGBB. Validated by Zod at the route boundary AND by the CHECK
     * below — it is interpolated into styles, so it must never be free text.
     * See docs/security.md §6.
     */
    color: char('color', { length: 7 }).notNull(),
    logoAssetId: uuid('logo_asset_id').references(() => mediaAssets.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('locations_user_slug_uniq').on(t.userId, t.slug),
    index('locations_user_sort_idx').on(t.userId, t.sortOrder),
    check('locations_color_hex_chk', sql`${t.color} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
)

/** Physical, Digital, Subscription, Emulated — seeded per account. */
export const gameTypes = pgTable(
  'game_types',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    slug: text('slug').notNull(),
    /** True for seeded rows: lets the UI mark them and lets re-seeding stay idempotent. */
    isDefault: boolean('is_default').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('game_types_user_slug_uniq').on(t.userId, t.slug)],
)

export const genres = pgTable(
  'genres',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    slug: text('slug').notNull(),
    /** Maps an IGDB genre onto this user's own row, so imports land correctly. */
    igdbId: integer('igdb_id'),
    isDefault: boolean('is_default').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('genres_user_slug_uniq').on(t.userId, t.slug),
    index('genres_user_igdb_idx').on(t.userId, t.igdbId),
  ],
)
