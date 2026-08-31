import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTwitchTokenManager } from './twitch-token.js'

/**
 * A minimal in-memory stand-in for the Redis commands the token manager uses.
 * Real Redis is exercised in the integration suite; here the point is to count
 * upstream token requests precisely, which needs deterministic control.
 */
function fakeRedis() {
  const store = new Map<string, { value: string; expiresAt: number }>()

  const live = (key: string): string | null => {
    const entry = store.get(key)
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      store.delete(key)
      return null
    }
    return entry.value
  }

  return {
    store,
    get: vi.fn((key: string) => Promise.resolve(live(key))),
    set: vi.fn((key: string, value: string, ...args: unknown[]) => {
      const nx = args.includes('NX')
      if (nx && live(key) !== null) return Promise.resolve(null)

      const exIndex = args.indexOf('EX')
      const pxIndex = args.indexOf('PX')
      const ttlMs =
        exIndex >= 0
          ? Number(args[exIndex + 1]) * 1000
          : pxIndex >= 0
            ? Number(args[pxIndex + 1])
            : 3_600_000

      store.set(key, { value, expiresAt: Date.now() + ttlMs })
      return Promise.resolve('OK')
    }),
    del: vi.fn((key: string) => {
      store.delete(key)
      return Promise.resolve(1)
    }),
  }
}

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Parameters<typeof createTwitchTokenManager>[0]['log']

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TwitchTokenManager', () => {
  it('fetches a token once and serves it from cache thereafter', async () => {
    const redis = fakeRedis()
    const fetchToken = vi.fn().mockResolvedValue({ access_token: 'tok-1', expires_in: 5_000_000 })

    const manager = createTwitchTokenManager({
      clientId: 'id',
      clientSecret: 'secret',
      redis: redis as never,
      log,
      fetchToken,
    })

    expect(await manager.getToken()).toBe('tok-1')
    expect(await manager.getToken()).toBe('tok-1')
    expect(await manager.getToken()).toBe('tok-1')

    expect(fetchToken).toHaveBeenCalledTimes(1)
  })

  it('collapses concurrent cold-start requests into a single fetch', async () => {
    const redis = fakeRedis()
    let resolveFetch: (v: { access_token: string; expires_in: number }) => void = () => undefined
    const pending = new Promise<{ access_token: string; expires_in: number }>((r) => {
      resolveFetch = r
    })
    const fetchToken = vi.fn().mockReturnValue(pending)

    const manager = createTwitchTokenManager({
      clientId: 'id',
      clientSecret: 'secret',
      redis: redis as never,
      log,
      fetchToken,
    })

    // 50 callers arrive before any token exists — the cold-start stampede.
    const all = Promise.all(Array.from({ length: 50 }, () => manager.getToken()))
    resolveFetch({ access_token: 'tok-concurrent', expires_in: 5_000_000 })
    const results = await all

    expect(results).toHaveLength(50)
    expect(new Set(results)).toEqual(new Set(['tok-concurrent']))
    // Without in-process single flight this would be 50 requests to Twitch.
    expect(fetchToken).toHaveBeenCalledTimes(1)
  })

  it('applies a safety margin to the cached TTL', async () => {
    const redis = fakeRedis()
    const fetchToken = vi.fn().mockResolvedValue({ access_token: 'tok', expires_in: 3600 })

    const manager = createTwitchTokenManager({
      clientId: 'id',
      clientSecret: 'secret',
      redis: redis as never,
      log,
      fetchToken,
    })
    await manager.getToken()

    // Cached for expires_in - 60, so a request never races real expiry.
    expect(redis.set).toHaveBeenCalledWith('igdb:token', 'tok', 'EX', 3540)
  })

  it('fetches again after invalidate, which is the 401 recovery path', async () => {
    const redis = fakeRedis()
    const fetchToken = vi
      .fn()
      .mockResolvedValueOnce({ access_token: 'old', expires_in: 5_000_000 })
      .mockResolvedValueOnce({ access_token: 'new', expires_in: 5_000_000 })

    const manager = createTwitchTokenManager({
      clientId: 'id',
      clientSecret: 'secret',
      redis: redis as never,
      log,
      fetchToken,
    })

    expect(await manager.getToken()).toBe('old')
    await manager.invalidate()
    expect(await manager.getToken()).toBe('new')
    expect(fetchToken).toHaveBeenCalledTimes(2)
  })

  it('releases the lock even when the token request fails', async () => {
    const redis = fakeRedis()
    const fetchToken = vi.fn().mockRejectedValue(new Error('twitch down'))

    const manager = createTwitchTokenManager({
      clientId: 'id',
      clientSecret: 'secret',
      redis: redis as never,
      log,
      fetchToken,
    })

    await expect(manager.getToken()).rejects.toThrow('twitch down')

    // A retained lock would wedge every later request for its full TTL.
    expect(redis.del).toHaveBeenCalledWith('igdb:token:lock')
    expect(redis.store.has('igdb:token:lock')).toBe(false)

    fetchToken.mockResolvedValueOnce({ access_token: 'recovered', expires_in: 5_000_000 })
    expect(await manager.getToken()).toBe('recovered')
  })

  it('never puts the client secret in the error message', async () => {
    const redis = fakeRedis()
    const fetchToken = vi.fn().mockRejectedValue(new Error('Token request failed with 403'))

    const manager = createTwitchTokenManager({
      clientId: 'id',
      clientSecret: 'super-secret-value',
      redis: redis as never,
      log,
      fetchToken,
    })

    await expect(manager.getToken()).rejects.toThrow(/403/)
    await expect(manager.getToken()).rejects.not.toThrow(/super-secret-value/)
  })
})
