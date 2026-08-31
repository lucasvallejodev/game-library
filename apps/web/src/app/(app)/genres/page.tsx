import { Tags } from 'lucide-react'

import { EmptyState } from '@/components/layout/empty-state/EmptyState'
import { Topbar } from '@/components/layout/topbar/Topbar'

export const metadata = { title: 'Genres · Game Library' }

export default function Page() {
  return (
    <>
      <Topbar title="Genres" />
      <EmptyState
        icon={Tags}
        title="Genres"
        description="Fourteen genres are seeded for you, and IGDB imports map onto them automatically."
      />
    </>
  )
}
