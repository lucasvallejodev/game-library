import type { FastifyRequest } from 'fastify'

import { UnauthenticatedError } from '../errors.js'

/**
 * The acting user's id, or a 401.
 *
 * Routes call this instead of asserting `request.user!`: it gives the same
 * narrowing without a non-null assertion, and it fails loudly rather than
 * throwing a TypeError if a route is ever registered without `requireAuth`.
 *
 * The id always comes from the session — never from a request parameter.
 * See docs/security.md §3.
 */
export function currentUserId(request: FastifyRequest): string {
  if (!request.user) {
    throw new UnauthenticatedError()
  }
  return request.user.id
}
