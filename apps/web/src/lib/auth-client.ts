'use client'

import { createAuthClient } from 'better-auth/react'

/**
 * Better Auth's browser client, pointed at the standalone API.
 *
 * It only ever moves cookies: no token is stored in JS, and nothing here can
 * reach Twitch or the database. See docs/security.md §1.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  basePath: '/api/auth',
  fetchOptions: {
    credentials: 'include',
  },
})

export const { signIn, signUp, signOut, useSession } = authClient
