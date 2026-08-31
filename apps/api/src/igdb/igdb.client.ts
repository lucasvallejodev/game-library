import type { FastifyBaseLogger } from 'fastify'
import type { Redis } from 'ioredis'

import { ExternalServiceError } from '../errors.js'
import { createIgdbRateLimiter, type RateLimiter } from './rate-limiter.js'
import type { TwitchTokenManager } from './twitch-token.js'

const IGDB_BASE = 'https://api.igdb.com/v4'

/** Fields requested for every game; kept in one place so search and fetch agree. */
const GAME_FIELDS =
  'fields id,name,summary,first_release_date,rating,cover.image_id,genres.id,genres.name;'

export interface IgdbRawGame {
  id: number
  name: string
  summary?: string
  first_release_date?: number
  rating?: number
  cover?: { image_id?: string }
  genres?: { id: number; name: string }[]
}

export interface IgdbClient {
  search: (query: string, limit: number) => Promise<IgdbRawGame[]>
  getById: (igdbId: number) => Promise<IgdbRawGame | null>
}

export interface IgdbClientOptions {
  clientId: string
  tokens: TwitchTokenManager
  redis: Redis
  log: FastifyBaseLogger
  /** Injectable for tests. */
  limiter?: RateLimiter
  fetchImpl?: typeof fetch
}

/** Search results churn; full game records barely move. */
const SEARCH_TTL_SECONDS = 300
const GAME_TTL_SECONDS = 86_400

export function createIgdbClient(options: IgdbClientOptions): IgdbClient {
  const { clientId, tokens, redis, log } = options
  const limiter = options.limiter ?? createIgdbRateLimiter(redis)
  const doFetch = options.fetchImpl ?? fetch

  /**
   * One IGDB request, with a single retry on 401.
   *
   * Exactly one: a token can legitimately be revoked or rotated, but retrying
   * repeatedly would hammer Twitch during an outage — turning their problem
   * into ours, at multiplied volume.
   */
  async function query(endpoint: string, body: string): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await limiter.acquire()

      const token = await tokens.getToken()
      const response = await doFetch(`${IGDB_BASE}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Client-ID': clientId,
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        body,
        signal: AbortSignal.timeout(10_000),
      })

      if (response.status === 401) {
        if (attempt === 0) {
          log.warn('IGDB rejected the app token; invalidating and retrying once')
          await tokens.invalidate()
          continue
        }
        // A second 401 means the credentials themselves are wrong, not that
        // the token went stale. Say so, rather than reporting a bare 401.
        throw new ExternalServiceError(
          'IGDB',
          'IGDB authentication failed after one retry; check TWITCH_CLIENT_ID/SECRET',
        )
      }

      if (response.status === 429) {
        throw new ExternalServiceError('IGDB', 'IGDB rate limit exceeded; try again shortly')
      }

      if (!response.ok) {
        throw new ExternalServiceError('IGDB', `IGDB responded with ${String(response.status)}`)
      }

      return response.json()
    }

    // Unreachable: the loop either returns or throws. Present so the function
    // has a definite return type.
    throw new ExternalServiceError('IGDB', 'IGDB request did not complete')
  }

  async function cached<T>(key: string, ttl: number, produce: () => Promise<T>): Promise<T> {
    const hit = await redis.get(key)
    if (hit) return JSON.parse(hit) as T

    const value = await produce()
    await redis.set(key, JSON.stringify(value), 'EX', ttl)
    return value
  }

  return {
    search: async (searchTerm, limit) => {
      // Normalised so "Witcher", "  witcher " and "WITCHER" share a cache entry.
      const normalized = searchTerm.trim().toLowerCase()
      const key = `igdb:search:${String(limit)}:${normalized}`

      return cached(key, SEARCH_TTL_SECONDS, async () => {
        // IGDB's query language is not SQL, but quotes still need escaping so
        // a term cannot break out of the search literal.
        const escaped = normalized.replace(/["\\]/g, '')
        const body = `search "${escaped}"; ${GAME_FIELDS} limit ${String(limit)};`
        return (await query('games', body)) as IgdbRawGame[]
      })
    },

    getById: async (igdbId) => {
      const key = `igdb:game:${String(igdbId)}`

      const rows = await cached(key, GAME_TTL_SECONDS, async () => {
        const body = `where id = ${String(igdbId)}; ${GAME_FIELDS} limit 1;`
        return (await query('games', body)) as IgdbRawGame[]
      })

      return rows[0] ?? null
    },
  }
}
