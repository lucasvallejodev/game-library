import type { GameList } from '@game-library/shared/schemas'

import { apiFetch } from '@/lib/api-client'
import { forwardedCookie } from '@/lib/session'

import { LibraryView } from './LibraryView'

export const metadata = { title: 'Library · Game Library' }

const EMPTY: GameList = {
  data: [],
  meta: { page: 1, perPage: 40, total: 0, totalPages: 1 },
}

/** Repeatable params arrive as string | string[]; normalise before forwarding. */
function appendAll(params: URLSearchParams, key: string, value: string | string[] | undefined) {
  if (value === undefined) return
  for (const v of Array.isArray(value) ? value : [value]) params.append(key, v)
}

/**
 * Server Component: the first page is fetched here with the session cookie
 * forwarded, so the HTML arrives populated. TanStack Query takes over for
 * every subsequent filter change. See ADR-009.
 *
 * The query string is built to match what useLibraryFilters() will produce for
 * the same URL, so the client reuses this payload instead of refetching.
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams

  const search = new URLSearchParams()
  if (typeof params.q === 'string' && params.q) search.set('q', params.q)
  appendAll(search, 'locationId', params.locationId)
  appendAll(search, 'gameTypeId', params.gameTypeId)
  appendAll(search, 'genreId', params.genreId)
  if (typeof params.sort === 'string' && params.sort !== 'name') search.set('sort', params.sort)
  if (typeof params.page === 'string' && params.page !== '1') search.set('page', params.page)

  const query = search.toString()

  let initialData = EMPTY
  try {
    initialData = await apiFetch<GameList>(`/api/games?${query}`, {
      cookie: await forwardedCookie(),
    })
  } catch {
    // Render the shell with an empty library rather than an error page: the
    // sidebar and navigation still work while the API is unreachable.
  }

  return <LibraryView initialData={initialData} initialQuery={query} />
}
