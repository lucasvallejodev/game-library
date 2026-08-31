import { Gamepad2 } from 'lucide-react'

import { EmptyState } from '@/components/layout/empty-state/EmptyState'
import { Topbar } from '@/components/layout/topbar/Topbar'

export const metadata = { title: 'Game Types · Game Library' }

export default function Page() {
  return (
    <>
      <Topbar title="Game Types" />
      <EmptyState
        icon={Gamepad2}
        title="Game Types"
        description="Physical, Digital, Subscription and Emulated are seeded for you. Add your own here."
      />
    </>
  )
}
