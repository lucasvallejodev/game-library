import type { WishlistList } from '@game-library/shared/schemas'

import { apiFetch } from '@/lib/api-client'
import { forwardedCookie } from '@/lib/session'

import { WishlistView } from './WishlistView'

export const metadata = { title: 'Wishlist · Game Library' }

const EMPTY: WishlistList = {
  data: [],
  meta: { page: 1, perPage: 40, total: 0, totalPages: 1 },
}

export default async function WishlistPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams

  const search = new URLSearchParams()
  if (typeof params.q === 'string' && params.q) search.set('q', params.q)
  // Most-wanted first is the useful default for a list you act on.
  search.set('sort', typeof params.sort === 'string' ? params.sort : '-priority')

  const query = search.toString()

  let initialData = EMPTY
  try {
    initialData = await apiFetch<WishlistList>(`/api/wishlist?${query}`, {
      cookie: await forwardedCookie(),
    })
  } catch {
    // Render the shell rather than an error page if the API is unreachable.
  }

  return <WishlistView initialData={initialData} initialQuery={query} />
}
