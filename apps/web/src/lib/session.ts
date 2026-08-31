import { headers } from 'next/headers'

import { apiFetch } from './api-client'

export interface SessionUser {
  id: string
  name: string
  email: string
  image: string | null
}

export interface SessionPayload {
  user: SessionUser
  session: { id: string; expiresAt: string }
}

/**
 * Read the session server-side, forwarding the incoming cookie.
 *
 * A Server Component has no ambient browser to attach cookies for it, so the
 * header must be passed through explicitly — this is the piece that makes the
 * first paint arrive populated instead of as a loading skeleton.
 * See docs/architecture.md §4.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookie = (await headers()).get('cookie') ?? ''
  if (!cookie) return null

  try {
    return await apiFetch<SessionPayload | null>('/api/auth/get-session', { cookie })
  } catch {
    // An unreachable API or a malformed cookie is an anonymous visitor, not a
    // crashed page.
    return null
  }
}

/** The cookie header to forward from a Server Component into an API call. */
export async function forwardedCookie(): Promise<string> {
  return (await headers()).get('cookie') ?? ''
}
