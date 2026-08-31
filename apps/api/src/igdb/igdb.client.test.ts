import { describe, expect, it, vi } from 'vitest'

import { createIgdbClient } from './igdb.client.js'
import type { TwitchTokenManager } from './twitch-token.js'

function fakeRedis() {
  const store = new Map<string, string>()
  return {
    get: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    set: vi.fn((k: string, v: string) => {
      store.set(k, v)
      return Promise.resolve('OK')
    }),
    incr: vi.fn(() => Promise.resolve(1)),
    expire: vi.fn(() => Promise.resolve(1)),
    del: vi.fn(() => Promise.resolve(1)),
  }
}

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Parameters<typeof createIgdbClient>[0]['log']

/** No-op limiter: rate limiting has its own concerns and would only add delay. */
const limiter = { acquire: () => Promise.resolve() }

function tokenManager(): TwitchTokenManager & { invalidate: ReturnType<typeof vi.fn> } {
  const invalidate = vi.fn(() => Promise.resolve())
  return { getToken: () => Promise.resolve('tok'), invalidate }
}

const okResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

describe('IgdbClient', () => {
  it('retries exactly once after a 401 and invalidates the token', async () => {
    const tokens = tokenManager()
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(okResponse([{ id: 1, name: 'Recovered' }]))

    const client = createIgdbClient({
      clientId: 'id',
      tokens,
      redis: fakeRedis() as never,
      log,
      limiter,
      fetchImpl: fetchImpl,
    })

    const results = await client.search('anything', 5)

    expect(results).toEqual([{ id: 1, name: 'Recovered' }])
    expect(tokens.invalidate).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('gives up after one retry rather than hammering Twitch', async () => {
    const tokens = tokenManager()
    const fetchImpl = vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 }))

    const client = createIgdbClient({
      clientId: 'id',
      tokens,
      redis: fakeRedis() as never,
      log,
      limiter,
      fetchImpl: fetchImpl,
    })

    await expect(client.search('anything', 5)).rejects.toThrow(/authentication failed/i)
    // Exactly two attempts: the original and one retry. A retry loop here
    // would multiply load on Twitch during an outage.
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('surfaces a 429 as a rate-limit error rather than retrying', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('slow down', { status: 429 }))

    const client = createIgdbClient({
      clientId: 'id',
      tokens: tokenManager(),
      redis: fakeRedis() as never,
      log,
      limiter,
      fetchImpl: fetchImpl,
    })

    await expect(client.search('anything', 5)).rejects.toThrow(/rate limit/i)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('serves a repeated search from cache without calling IGDB again', async () => {
    const redis = fakeRedis()
    const fetchImpl = vi.fn().mockResolvedValue(okResponse([{ id: 7, name: 'Cached' }]))

    const client = createIgdbClient({
      clientId: 'id',
      tokens: tokenManager(),
      redis: redis as never,
      log,
      limiter,
      fetchImpl: fetchImpl,
    })

    await client.search('Witcher', 10)
    await client.search('  witcher  ', 10) // normalised to the same cache key
    await client.search('WITCHER', 10)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('strips quotes so a search term cannot break out of the IGDB literal', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse([]))

    const client = createIgdbClient({
      clientId: 'id',
      tokens: tokenManager(),
      redis: fakeRedis() as never,
      log,
      limiter,
      fetchImpl: fetchImpl,
    })

    await client.search('evil"; fields *; where id > 0', 5)

    const body = (fetchImpl.mock.calls[0]?.[1] as { body: string }).body
    expect(body).not.toContain('evil";')
    expect(body).toMatch(/^search "evil; fields \*; where id > 0";/)
  })
})
