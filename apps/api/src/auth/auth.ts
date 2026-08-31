import { type Database, schema } from '@game-library/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { FastifyBaseLogger } from 'fastify'

import type { Env } from '../env.js'
import { seedUserDefaults } from './seed-defaults.js'

export type Auth = ReturnType<typeof createAuth>

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30
const ONE_DAY_IN_SECONDS = 60 * 60 * 24

/**
 * Better Auth instance: email/password plus Google OAuth, backed by our own
 * Postgres through the Drizzle adapter. See docs/security.md §1.
 */
export function createAuth(db: Database, env: Env, log: FastifyBaseLogger) {
  const hasGoogle = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)

  return betterAuth({
    appName: 'Game Library',
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    trustedOrigins: [env.WEB_ORIGIN],

    database: drizzleAdapter(db, {
      provider: 'pg',
      // Our table variables are plural; Better Auth's models are singular.
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),

    emailAndPassword: {
      enabled: true,
      // docs/security.md §1: length over composition rules.
      minPasswordLength: 12,
      maxPasswordLength: 256,
      autoSignIn: true,
    },

    socialProviders: hasGoogle
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID ?? '',
            clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
          },
        }
      : {},

    account: {
      accountLinking: {
        enabled: true,
        // Only link a social login to an existing password account when the
        // provider verified the address. Otherwise anyone who registers an
        // unverified account at your address could take it over.
        trustedProviders: ['google'],
      },
    },

    session: {
      // Database-backed, so signing out revokes immediately — see ADR-003.
      expiresIn: THIRTY_DAYS_IN_SECONDS,
      updateAge: ONE_DAY_IN_SECONDS,
    },

    advanced: {
      cookiePrefix: 'game-library',
      useSecureCookies: env.NODE_ENV === 'production',
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      },
    },

    databaseHooks: {
      user: {
        create: {
          /**
           * Seed the account's default GameTypes and Genres.
           *
           * Failures are logged, never rethrown. Better Auth's Drizzle adapter
           * has no transaction support (ADR-016), so throwing here would abort
           * the request *after* the user row is already committed — leaving an
           * account that exists but cannot be registered again. An account
           * briefly missing its defaults is recoverable; a half-created one
           * that blocks re-registration is not.
           */
          after: async (user) => {
            try {
              const result = await seedUserDefaults(db, user.id)
              log.info({ userId: user.id, ...result }, 'seeded account defaults')
            } catch (error) {
              log.error(
                { err: error, userId: user.id },
                'failed to seed account defaults; account will be healed on next access',
              )
            }
          },
        },
      },
    },
  })
}
