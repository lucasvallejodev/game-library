'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

/**
 * TanStack Query drives filtering, pagination and mutations. Initial page data
 * comes from Server Components, so this is for interaction, not first paint.
 * See docs/adr.md ADR-009.
 */
export function QueryProvider({ children }: { children: ReactNode }): ReactNode {
  // Created in state, not at module scope: a module-level client would be
  // shared across requests on the server and leak one user's cache to another.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
