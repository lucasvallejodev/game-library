'use client'

import type { GameDetail, WishlistItem, WishlistList } from '@game-library/shared/schemas'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'

import { apiFetch } from '@/lib/api-client'

export const wishlistKeys = {
  list: (query: string) => ['wishlist', query] as const,
}

export function useWishlist(query: string, initialData?: WishlistList) {
  return useQuery({
    queryKey: wishlistKeys.list(query),
    queryFn: () => apiFetch<WishlistList>(`/api/wishlist?${query}`),
    ...(initialData ? { initialData } : {}),
    placeholderData: (previous: WishlistList | undefined) => previous,
  })
}

/** Everything that changes when the wishlist or library moves. */
function useCrossInvalidate() {
  const client = useQueryClient()
  const router = useRouter()

  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['wishlist'] }),
      client.invalidateQueries({ queryKey: ['games'] }),
      // IGDB results carry inLibrary/inWishlist flags that have just changed.
      client.invalidateQueries({ queryKey: ['igdb'] }),
    ])
    // The sidebar counts are server-rendered and unreachable from here.
    router.refresh()
  }
}

export function useAddToWishlist() {
  const invalidate = useCrossInvalidate()

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<WishlistItem>('/api/wishlist', { method: 'POST', body }),
    onSuccess: invalidate,
  })
}

export function useRemoveFromWishlist() {
  const invalidate = useCrossInvalidate()

  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/wishlist/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

export function useUpdateWishlistItem() {
  const invalidate = useCrossInvalidate()

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiFetch<WishlistItem>(`/api/wishlist/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  })
}

/** Bought it: move the item into the library. */
export function usePromoteWishlistItem() {
  const invalidate = useCrossInvalidate()

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiFetch<GameDetail>(`/api/wishlist/${id}/promote`, { method: 'POST', body }),
    onSuccess: invalidate,
  })
}
