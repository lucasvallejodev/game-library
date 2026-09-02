'use client'

import type { GameType, Genre } from '@game-library/shared/schemas'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'

import { apiFetch } from '@/lib/api-client'

/**
 * Game types and genres are the same shape — a per-user row with a name, a
 * seeded-or-not flag and a usage count — so they share one set of hooks
 * parameterised by kind rather than two near-identical copies.
 *
 * Locations are deliberately *not* here: they carry a colour and a logo, and
 * their screen has upload actions these two do not.
 */
export type TaxonomyKind = 'game-types' | 'genres'

/** The subset both `GameType` and `Genre` structurally satisfy. */
export interface TaxonomyItem {
  id: string
  name: string
  slug: string
  isDefault: boolean
  gameCount: number
}

export type TaxonomyRecord = GameType | Genre

export const taxonomyKeys = {
  /**
   * Nested under the library's combined `['taxonomy']` query on purpose: one
   * `invalidateQueries({ queryKey: ['taxonomy'] })` refreshes the filter bar
   * and both of these lists by prefix match.
   */
  list: (kind: TaxonomyKind) => ['taxonomy', kind] as const,
}

export function useTaxonomyList(kind: TaxonomyKind, initialData?: TaxonomyRecord[]) {
  return useQuery({
    queryKey: taxonomyKeys.list(kind),
    queryFn: async () => (await apiFetch<{ data: TaxonomyRecord[] }>(`/api/${kind}`)).data,
    ...(initialData ? { initialData } : {}),
  })
}

/**
 * A rename or delete here is visible on every game card and in the filter bar,
 * so it invalidates more than its own list.
 */
function useInvalidate() {
  const client = useQueryClient()
  const router = useRouter()

  return async () => {
    await Promise.all([
      // Prefix match: covers the combined taxonomy query and both lists.
      client.invalidateQueries({ queryKey: ['taxonomy'] }),
      // Cards carry type and genre labels.
      client.invalidateQueries({ queryKey: ['games'] }),
      client.invalidateQueries({ queryKey: ['wishlist'] }),
    ])
    router.refresh()
  }
}

export function useCreateTaxonomy(kind: TaxonomyKind) {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: (body: { name: string }) =>
      apiFetch<TaxonomyRecord>(`/api/${kind}`, { method: 'POST', body }),
    onSuccess: invalidate,
  })
}

export function useUpdateTaxonomy(kind: TaxonomyKind) {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiFetch<TaxonomyRecord>(`/api/${kind}/${id}`, { method: 'PATCH', body: { name } }),
    onSuccess: invalidate,
  })
}

export function useDeleteTaxonomy(kind: TaxonomyKind) {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/${kind}/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}
