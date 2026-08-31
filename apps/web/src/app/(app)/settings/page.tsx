import { Settings } from 'lucide-react'

import { EmptyState } from '@/components/layout/empty-state/EmptyState'
import { Topbar } from '@/components/layout/topbar/Topbar'

export const metadata = { title: 'Settings · Game Library' }

export default function Page() {
  return (
    <>
      <Topbar title="Settings" />
      <EmptyState
        icon={Settings}
        title="Settings"
        description="Account and instance settings will live here."
      />
    </>
  )
}
