import type { Genre } from '@game-library/shared/schemas'

import { TaxonomyView } from '@/components/taxonomy/TaxonomyView'
import { apiFetch } from '@/lib/api-client'
import { forwardedCookie } from '@/lib/session'

export const metadata = { title: 'Genres · Game Library' }

export default async function GenresPage() {
  let initialData: Genre[] = []
  try {
    initialData = (
      await apiFetch<{ data: Genre[] }>('/api/genres', { cookie: await forwardedCookie() })
    ).data
  } catch {
    // Render the shell rather than an error page if the API is unreachable.
  }

  // Only serialisable props cross this boundary — the icon and the delete copy
  // live inside TaxonomyView, which is a client component.
  return <TaxonomyView kind="genres" initialData={initialData} />
}
