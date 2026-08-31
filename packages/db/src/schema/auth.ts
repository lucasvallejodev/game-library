import { boolean, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

/**
 * Better Auth tables.
 *
 * ⚠️ These mirror Better Auth's default schema and exist here so application
 * tables can declare real foreign keys to `user.id`. Increment 5 wires up
 * Better Auth itself; from that point on, regenerate these with the Better
 * Auth CLI rather than hand-editing them. See docs/database.md §3.1.
 *
 * Note the id type: Better Auth generates opaque string ids, so these are
 * `text`, not `uuid`. Application tables therefore carry a `text` user_id
 * while keeping their own `uuid` primary keys.
 */

export const users = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('user_email_uniq').on(t.email)],
)

export const sessions = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('session_token_uniq').on(t.token)],
)

/**
 * One row per sign-in method. This is what lets the same person use both
 * email/password (via `password`) and Google (via provider_id + account_id)
 * against a single `user` row. See docs/security.md §1.
 */
export const accounts = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * Required by Better Auth 1.7 and part of its unique index. Verified
     * against @better-auth/core's own table definitions rather than written
     * from memory — the first hand-written version omitted it and every
     * sign-up failed at runtime. See docs/adr.md ADR-016.
     */
    issuer: text('issuer').notNull(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    password: text('password'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Better Auth declares this on (issuer, accountId).
    uniqueIndex('account_issuer_account_uniq').on(t.issuer, t.accountId),
    index('account_user_idx').on(t.userId),
  ],
)

export const verifications = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
