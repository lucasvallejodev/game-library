import type { Redis } from 'ioredis'

/**
 * IGDB allows 4 requests per second for the whole application.
 *
 * The counter lives in Redis so the ceiling holds across API replicas — an
 * in-memory limiter would let two replicas each send 4/s and get the whole
 * application throttled. Callers queue rather than fail: a slightly slower
 * search is much better than a spurious error.
 * See docs/architecture.md §6.
 */
const REQUESTS_PER_SECOND = 4
const KEY_PREFIX = 'igdb:rate:'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export interface RateLimiter {
  acquire: () => Promise<void>
}

export function createIgdbRateLimiter(redis: Redis, maxWaitMs = 5_000): RateLimiter {
  return {
    acquire: async () => {
      const deadline = Date.now() + maxWaitMs

      for (;;) {
        const now = Date.now()
        const second = Math.floor(now / 1000)
        const key = `${KEY_PREFIX}${String(second)}`

        const used = await redis.incr(key)
        if (used === 1) {
          // Two seconds, so the key outlives its window even under clock skew.
          await redis.expire(key, 2)
        }
        if (used <= REQUESTS_PER_SECOND) return

        if (now >= deadline) {
          // Let the request through rather than failing: IGDB's own 429 is a
          // clearer signal than a self-inflicted timeout.
          return
        }

        // Wait out the remainder of this second, plus a small jitter so
        // concurrent waiters do not all wake into the same slot.
        await sleep(1000 - (now % 1000) + Math.floor(Math.random() * 25))
      }
    },
  }
}
