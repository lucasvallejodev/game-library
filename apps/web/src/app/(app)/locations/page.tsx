import type { Location } from '@game-library/shared/schemas'

import { apiFetch } from '@/lib/api-client'
import { forwardedCookie } from '@/lib/session'

import { LocationsView } from './LocationsView'

export const metadata = { title: 'Locations · Game Library' }

export default async function LocationsPage() {
  let initialData: Location[] = []
  try {
    initialData = (
      await apiFetch<{ data: Location[] }>('/api/locations', { cookie: await forwardedCookie() })
    ).data
  } catch {
    // Render the shell rather than an error page if the API is unreachable.
  }

  return <LocationsView initialData={initialData} />
}
