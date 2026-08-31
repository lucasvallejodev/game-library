import type { FastifyBaseLogger } from 'fastify'
import type { Redis } from 'ioredis'

import { ExternalServiceError } from '../errors.js'

const TOKEN_KEY = 'igdb:token'
const LOCK_KEY = 'igdb:token:lock'
const LOCK_TTL_MS = 10_000
/** Refresh this far before real expiry, so a request never races the clock. */
const EXPIRY_SAFETY_SECONDS = 60

export interface TwitchTokenManager {
  getToken: () => Promise<string>
  /** Drop the cached token after a 401, so the next call fetches a fresh one. */
  invalidate: () => Promise<void>
}

export interface TwitchTokenOptions {
  clientId: string
  clientSecret: string
  redis: Redis
  log: FastifyBaseLogger
  /** Injectable for tests; defaults to the real Twitch endpoint. */
  fetchToken?: () => Promise<{ access_token: string; expires_in: number }>
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function requestToken(
  clientId: string,
  clientSecret: string,
): Promise<{ access_token: string; expires_in: number }> {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  })

  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: params,
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    // Deliberately does not include the response body: a Twitch error can echo
    // request parameters, and this must never become a credential disclosure.
    throw new ExternalServiceError('Twitch', `Token request failed with ${String(response.status)}`)
  }

  return (await response.json()) as { access_token: string; expires_in: number }
}

/**
 * Owns the Twitch app access token used for every IGDB call.
 *
 * IGDB authenticates the *application*, not a user — there is no consent step
 * — which is exactly why the client secret must never leave the server.
 * See docs/security.md §4.
 *
 * Two layers of de-duplication, because they solve different problems:
 *
 *   1. An in-process promise, so N concurrent requests inside this Node
 *      process share one fetch.
 *   2. A Redis lock, so N *replicas* starting cold do not each request a
 *      token. Twitch rate-limits token issuance.
 *
 * Without either, a cold start under load fires one token request per
 * in-flight call.
 */
export function createTwitchTokenManager(options: TwitchTokenOptions): TwitchTokenManager {
  const { redis, log, clientId, clientSecret } = options
  const fetchToken = options.fetchToken ?? (() => requestToken(clientId, clientSecret))

  let inFlight: Promise<string> | null = null

  async function fetchAndCache(): Promise<string> {
    const token = await fetchToken()
    const ttl = Math.max(60, token.expires_in - EXPIRY_SAFETY_SECONDS)
    await redis.set(TOKEN_KEY, token.access_token, 'EX', ttl)
    log.info({ ttlSeconds: ttl }, 'obtained Twitch app access token')
    return token.access_token
  }

  async function resolve(): Promise<string> {
    const cached = await redis.get(TOKEN_KEY)
    if (cached) return cached

    // Cross-process single flight.
    const acquired = await redis.set(LOCK_KEY, '1', 'PX', LOCK_TTL_MS, 'NX')

    if (acquired) {
      try {
        return await fetchAndCache()
      } finally {
        await redis.del(LOCK_KEY)
      }
    }

    // Another process is fetching — wait briefly for it to publish the token
    // rather than issuing a competing request.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await sleep(50)
      const token = await redis.get(TOKEN_KEY)
      if (token) return token
    }

    // The lock holder died or is pathologically slow. Fetching is better than
    // failing the user's request.
    log.warn('timed out waiting for another process to fetch the Twitch token')
    return fetchAndCache()
  }

  return {
    getToken: async () => {
      // In-process single flight: share one resolution across concurrent calls.
      inFlight ??= resolve().finally(() => {
        inFlight = null
      })
      return inFlight
    },

    invalidate: async () => {
      await redis.del(TOKEN_KEY)
      inFlight = null
    },
  }
}
