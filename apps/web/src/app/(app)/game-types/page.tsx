import type { GameType } from '@game-library/shared/schemas'

import { TaxonomyView } from '@/components/taxonomy/TaxonomyView'
import { apiFetch } from '@/lib/api-client'
import { forwardedCookie } from '@/lib/session'

export const metadata = { title: 'Game Types · Game Library' }

export default async function GameTypesPage() {
  let initialData: GameType[] = []
  try {
    initialData = (
      await apiFetch<{ data: GameType[] }>('/api/game-types', { cookie: await forwardedCookie() })
    ).data
  } catch {
    // Render the shell rather than an error page if the API is unreachable.
  }

  // Only serialisable props cross this boundary — the icon and the delete copy
  // live inside TaxonomyView, which is a client component.
  return <TaxonomyView kind="game-types" initialData={initialData} />
}
