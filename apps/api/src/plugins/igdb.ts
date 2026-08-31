import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

import { ExternalServiceError } from '../errors.js'
import { createIgdbClient, type IgdbClient } from '../igdb/igdb.client.js'
import { createTwitchTokenManager } from '../igdb/twitch-token.js'

declare module 'fastify' {
  interface FastifyInstance {
    /** Null when Twitch credentials are not configured. */
    igdb: IgdbClient | null
    /** The client, or a 502 explaining that IGDB is not configured. */
    requireIgdb: () => IgdbClient
  }
}

/**
 * Wires up IGDB access. TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET live only in
 * this process — never in the web bundle, never in a response.
 * See docs/security.md §4.
 */
function igdbPlugin(app: FastifyInstance): void {
  const { TWITCH_CLIENT_ID: clientId, TWITCH_CLIENT_SECRET: clientSecret } = app.config

  if (!clientId || !clientSecret) {
    // Not fatal: the library is fully usable with manually added games. The
    // IGDB routes simply report that the integration is unconfigured.
    app.log.warn('TWITCH_CLIENT_ID/SECRET not set; IGDB features are disabled')
    app.decorate('igdb', null)
  } else {
    const tokens = createTwitchTokenManager({
      clientId,
      clientSecret,
      redis: app.redis,
      log: app.log,
    })
    app.decorate('igdb', createIgdbClient({ clientId, tokens, redis: app.redis, log: app.log }))
  }

  app.decorate('requireIgdb', () => {
    if (!app.igdb) {
      throw new ExternalServiceError(
        'IGDB',
        'IGDB is not configured on this server. Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET.',
      )
    }
    return app.igdb
  })
}

export default fp(igdbPlugin, { name: 'igdb', dependencies: ['config', 'redis'] })
