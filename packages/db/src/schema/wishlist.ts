import { sql } from 'drizzle-orm'
import {
  char,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import { newId } from '../id.js'
import { users } from './auth.js'
import { games } from './games.js'
import { mediaAssets } from './media.js'
import { gameTypes, genres } from './taxonomy.js'

export const wishlistPriorityEnum = pgEnum('wishlist_priority', ['low', 'medium', 'high'])

/**
 * Wanted, not owned.
 *
 * A separate table rather than a status on `games` because these columns
 * (priority, target price, store URL) would be permanently null on every owned
 * game. See docs/adr.md ADR-007.
 */
export const wishlistItems = pgTable(
  'wishlist_items',
  {
    id: uuid('id').primaryKey().$defaultFn(newId),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    igdbId: integer('igdb_id'),
    name: text('name').notNull(),
    sortName: text('sort_name')
      .notNull()
      .generatedAlwaysAs(sql`regexp_replace(name, '^(the|a|an)\\s+', '', 'i')`),

    summary: text('summary'),
    releaseDate: date('release_date'),

    gameTypeId: uuid('game_type_id').references(() => gameTypes.id, { onDelete: 'set null' }),
    coverAssetId: uuid('cover_asset_id').references(() => mediaAssets.id, { onDelete: 'set null' }),

    priority: wishlistPriorityEnum('priority').notNull().default('medium'),
    targetPrice: numeric('target_price', { precision: 10, scale: 2 }),
    /** ISO 4217. Never store money without the currency it is denominated in. */
    currency: char('currency', { length: 3 }),
    storeUrl: text('store_url'),
    notes: text('notes'),

    /** Set when this item was promoted into the library, for provenance. */
    promotedGameId: uuid('promoted_game_id').references(() => games.id, { onDelete: 'set null' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('wishlist_user_sort_name_idx').on(t.userId, t.sortName),
    index('wishlist_user_priority_idx').on(t.userId, t.priority),
    index('wishlist_user_type_idx').on(t.userId, t.gameTypeId),
    // Partial unique index on (user_id, igdb_id) is hand-appended to the
    // generated migration — see docs/database.md §6.
  ],
)

export const wishlistItemGenres = pgTable(
  'wishlist_item_genres',
  {
    wishlistItemId: uuid('wishlist_item_id')
      .notNull()
      .references(() => wishlistItems.id, { onDelete: 'cascade' }),
    genreId: uuid('genre_id')
      .notNull()
      .references(() => genres.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.wishlistItemId, t.genreId] }),
    index('wishlist_item_genres_genre_idx').on(t.genreId),
  ],
)
