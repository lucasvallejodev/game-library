import { HardDrive } from 'lucide-react'

import { EmptyState } from '@/components/layout/empty-state/EmptyState'
import { Topbar } from '@/components/layout/topbar/Topbar'

export const metadata = { title: 'Locations · Game Library' }

export default function Page() {
  return (
    <>
      <Topbar title="Locations" />
      <EmptyState
        icon={HardDrive}
        title="Locations"
        description="Where your games live — GOG, Steam, an external drive. Add your first one to start filing games."
      />
    </>
  )
}
