import { describe, expect, it } from 'vitest'

import { EnvValidationError, parseEnv } from './env.js'

const valid = {
  WEB_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://user:pw@localhost:5432/db',
  REDIS_URL: 'redis://:pw@localhost:6379',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:4000',
} satisfies NodeJS.ProcessEnv

describe('parseEnv', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const env = parseEnv(valid)

    expect(env.NODE_ENV).toBe('development')
    expect(env.API_PORT).toBe(4000)
    expect(env.STORAGE_DRIVER).toBe('s3')
    expect(env.MAX_UPLOAD_BYTES).toBe(8_388_608)
  })

  it('coerces numeric strings, since every env var arrives as a string', () => {
    const env = parseEnv({ ...valid, API_PORT: '8080' })
    expect(env.API_PORT).toBe(8080)
    expect(typeof env.API_PORT).toBe('number')
  })

  it('transforms S3_FORCE_PATH_STYLE into a real boolean', () => {
    expect(parseEnv({ ...valid, S3_FORCE_PATH_STYLE: 'false' }).S3_FORCE_PATH_STYLE).toBe(false)
    expect(parseEnv({ ...valid, S3_FORCE_PATH_STYLE: 'true' }).S3_FORCE_PATH_STYLE).toBe(true)
  })

  it('treats an empty value as absent so a blank line in .env uses the default', () => {
    const env = parseEnv({ ...valid, API_PORT: '', GOOGLE_CLIENT_ID: '' })
    expect(env.API_PORT).toBe(4000)
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined()
  })

  it('rejects a missing required variable, naming it', () => {
    const { DATABASE_URL: _omitted, ...withoutDb } = valid

    expect(() => parseEnv(withoutDb)).toThrow(EnvValidationError)
    expect(() => parseEnv(withoutDb)).toThrow(/DATABASE_URL/)
  })

  it('rejects a short signing secret with an actionable message', () => {
    expect(() => parseEnv({ ...valid, BETTER_AUTH_SECRET: 'too-short' })).toThrow(
      /BETTER_AUTH_SECRET.*at least 32 characters/s,
    )
  })

  it('rejects a database URL with the wrong protocol', () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: 'mysql://localhost:3306/db' })).toThrow(
      /DATABASE_URL.*Postgres/s,
    )
    expect(() => parseEnv({ ...valid, DATABASE_URL: 'not-a-url' })).toThrow(/DATABASE_URL/)
  })

  it('rejects a redis URL with the wrong protocol', () => {
    expect(() => parseEnv({ ...valid, REDIS_URL: 'http://localhost:6379' })).toThrow(
      /REDIS_URL.*Redis/s,
    )
  })

  it('rejects an out-of-range port', () => {
    expect(() => parseEnv({ ...valid, API_PORT: '99999' })).toThrow(/API_PORT/)
    expect(() => parseEnv({ ...valid, API_PORT: 'http' })).toThrow(/API_PORT/)
  })

  it('reports every problem at once, not just the first', () => {
    const { DATABASE_URL: _a, REDIS_URL: _b, ...partial } = valid

    try {
      parseEnv({ ...partial, BETTER_AUTH_SECRET: 'short' })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError)
      const message = (error as EnvValidationError).message
      expect(message).toContain('DATABASE_URL')
      expect(message).toContain('REDIS_URL')
      expect(message).toContain('BETTER_AUTH_SECRET')
    }
  })
})
