'use client'

import type { WishlistItem, WishlistList } from '@game-library/shared/schemas'
import { Heart, Plus } from 'lucide-react'
import { useState } from 'react'

import { AddGameDialog } from '@/components/game/add-game-dialog/AddGameDialog'
import { WishlistCard } from '@/components/game/wishlist-card/WishlistCard'
import { EmptyState } from '@/components/layout/empty-state/EmptyState'
import { Topbar } from '@/components/layout/topbar/Topbar'
import { Button } from '@/components/ui/button/Button'
import {
  usePromoteWishlistItem,
  useRemoveFromWishlist,
  useWishlist,
} from '@/features/wishlist/queries'
import { ApiError } from '@/lib/api-client'

import styles from '@/components/game/wishlist-card/WishlistCard.module.scss'

export interface WishlistViewProps {
  initialData: WishlistList
  initialQuery: string
}

export function WishlistView({ initialData, initialQuery }: WishlistViewProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const query = useWishlist(initialQuery, initialData)
  const promote = usePromoteWishlistItem()
  const remove = useRemoveFromWishlist()

  const data = query.data ?? initialData
  const busy = promote.isPending || remove.isPending

  function handlePromote(item: WishlistItem) {
    setError(null)
    promote.mutate(
      { id: item.id, body: { acquiredAt: new Date().toISOString().slice(0, 10) } },
      {
        onError: (err) => {
          setError(
            err instanceof ApiError
              ? err.message
              : `Could not move “${item.name}” to your library.`,
          )
        },
      },
    )
  }

  function handleRemove(item: WishlistItem) {
    if (!window.confirm(`Remove “${item.name}” from your wishlist?`)) return
    setError(null)
    remove.mutate(item.id)
  }

  return (
    <>
      <Topbar
        title="Wishlist"
        onAdd={() => {
          setAddOpen(true)
        }}
      />

      {error && (
        <p role="alert" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}

      {data.data.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Nothing on your wishlist"
          description="Add a game you want. If it turns out you already own it, you will be told before you can add it."
          action={
            <Button
              variant="primary"
              onClick={() => {
                setAddOpen(true)
              }}
            >
              <Plus aria-hidden="true" />
              Add a game
            </Button>
          }
        />
      ) : (
        <div className={styles.list}>
          {data.data.map((item) => (
            <WishlistCard
              key={item.id}
              item={item}
              busy={busy}
              onPromote={handlePromote}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      {/* Same dialog as the library, in wishlist mode. */}
      <AddGameDialog open={addOpen} onOpenChange={setAddOpen} mode="wishlist" />
    </>
  )
}
