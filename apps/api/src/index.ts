/**
 * Process entrypoint for the API.
 *
 * Increment 4 replaces this with the real bootstrap: parse the environment
 * with Zod (exiting on invalid config), build the Fastify instance via
 * buildServer(), bind the port, and wire graceful shutdown.
 *
 * The layering rules this app must follow are in docs/architecture.md §5 and
 * AGENTS.md — in particular, every repository function takes userId first.
 */

import { slugify } from '@game-library/shared'

export function describeService(): string {
  return `game-library-api (${slugify('Game Library API')})`
}
