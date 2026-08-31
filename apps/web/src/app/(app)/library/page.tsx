import type { GameList } from '@game-library/shared/schemas'

import { apiFetch } from '@/lib/api-client'
import { forwardedCookie } from '@/lib/session'

import { LibraryView } from './LibraryView'

export const metadata = { title: 'Library · Game Library' }

const EMPTY: GameList = {
  data: [],
  meta: { page: 1, perPage: 40, total: 0, totalPages: 1 },
}

/**
 * Server Component: the first page of games is fetched here, with the session
 * cookie forwarded, so the HTML arrives populated. TanStack Query takes over
 * for filtering and pagination from increment 11. See ADR-009.
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : ''

  const search = new URLSearchParams()
  if (q) search.set('q', q)

  let initialData = EMPTY
  try {
    initialData = await apiFetch<GameList>(`/api/games?${search.toString()}`, {
      cookie: await forwardedCookie(),
    })
  } catch {
    // Render the shell with an empty library rather than an error page: the
    // sidebar and navigation still work while the API is unreachable.
  }

  return <LibraryView initialData={initialData} query={q} />
}
