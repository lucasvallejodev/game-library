import { Heart } from 'lucide-react'

import { EmptyState } from '@/components/layout/empty-state/EmptyState'
import { Topbar } from '@/components/layout/topbar/Topbar'

export const metadata = { title: 'Wishlist · Game Library' }

export default function Page() {
  return (
    <>
      <Topbar title="Wishlist" />
      <EmptyState
        icon={Heart}
        title="Wishlist"
        description="Games you want. Adding one here warns you if it is already in your library."
      />
    </>
  )
}
