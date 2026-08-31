import { z } from 'zod'

/**
 * Environment parsing.
 *
 * Config is validated once, at boot, and the process refuses to start if it is
 * wrong. A missing secret should fail loudly on startup rather than at 3am on
 * its first use. See docs/security.md §8.
 */

/** A connection string with one of the given protocols — `z.url()` is too http-centric. */
function connectionUrl(protocols: readonly string[], label: string) {
  return z.string().refine(
    (value) => {
      try {
        return protocols.includes(new URL(value).protocol.replace(':', ''))
      } catch {
        return false
      }
    },
    { message: `must be a valid ${label} URL (${protocols.map((p) => `${p}://`).join(' or ')})` },
  )
}

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),

  /** CORS allowlist. Never `*` — see docs/security.md §2. */
  WEB_ORIGIN: z.url(),

  DATABASE_URL: connectionUrl(['postgres', 'postgresql'], 'Postgres'),
  REDIS_URL: connectionUrl(['redis', 'rediss'], 'Redis'),

  /**
   * 32 chars minimum. A short signing secret is the kind of thing that looks
   * fine in development and quietly weakens every session in production.
   */
  BETTER_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  BETTER_AUTH_URL: z.url(),

  // Optional until the increments that wire them up. Empty string is treated
  // as absent so a blank line in .env does not read as a configured value.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // SERVER ONLY. Never exposed to the browser — see docs/security.md §4.
  TWITCH_CLIENT_ID: z.string().optional(),
  TWITCH_CLIENT_SECRET: z.string().optional(),

  STORAGE_DRIVER: z.enum(['s3', 'local']).default('s3'),
  STORAGE_LOCAL_PATH: z.string().min(1).default('./storage'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(8_388_608),

  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1).default('game-library-media'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
})

export type Env = z.infer<typeof envSchema>

export class EnvValidationError extends Error {
  constructor(readonly issues: readonly z.core.$ZodIssue[]) {
    const lines = issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
    super(`Invalid environment configuration:\n${lines.join('\n')}`)
    this.name = 'EnvValidationError'
  }
}

/**
 * Parse and validate. Throws EnvValidationError rather than exiting, so tests
 * can assert on the message without killing the test runner.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Treat empty strings as absent, so an unfilled `KEY=` in .env falls back to
  // the default instead of failing validation with a confusing message.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ''),
  )

  const result = envSchema.safeParse(cleaned)
  if (!result.success) {
    throw new EnvValidationError(result.error.issues)
  }
  return result.data
}

/**
 * Parse for the real process: on failure print the problem and exit non-zero.
 * Used by the entrypoint only.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  try {
    return parseEnv(source)
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(`\n${error.message}\n`)
      console.error('See .env.example for the documented template.\n')
      process.exit(1)
    }
    throw error
  }
}
