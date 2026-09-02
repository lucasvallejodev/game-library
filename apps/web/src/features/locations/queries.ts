'use client'

import type { Location } from '@game-library/shared/schemas'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'

import { apiFetch } from '@/lib/api-client'

export const locationKeys = {
  list: ['locations'] as const,
}

export function useLocations(initialData?: Location[]) {
  return useQuery({
    queryKey: locationKeys.list,
    queryFn: async () => (await apiFetch<{ data: Location[] }>('/api/locations')).data,
    ...(initialData ? { initialData } : {}),
  })
}

/**
 * Locations appear as chips on every game card and as a filter facet, so a
 * change here invalidates more than its own list.
 */
function useInvalidate() {
  const client = useQueryClient()
  const router = useRouter()

  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: locationKeys.list }),
      // The filter bar reads locations through the taxonomy query.
      client.invalidateQueries({ queryKey: ['taxonomy'] }),
      // Cards carry location chips.
      client.invalidateQueries({ queryKey: ['games'] }),
    ])
    router.refresh()
  }
}

export function useCreateLocation() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: (body: { name: string; color: string; sortOrder?: number }) =>
      apiFetch<Location>('/api/locations', { method: 'POST', body }),
    onSuccess: invalidate,
  })
}

export function useUpdateLocation() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiFetch<Location>(`/api/locations/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  })
}

export function useDeleteLocation() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/locations/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

/**
 * Logo upload is multipart, so it bypasses apiFetch's JSON body handling.
 */
export function useUploadLocationLogo() {
  const invalidate = useInvalidate()
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const form = new FormData()
      form.append('file', file)

      const response = await fetch(`${apiUrl}/api/locations/${id}/logo`, {
        method: 'POST',
        body: form,
        credentials: 'include',
        // The API checks Origin on state-changing requests.
        headers: { origin: window.location.origin },
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        throw new Error(body?.error?.message ?? 'Could not upload that image')
      }

      return (await response.json()) as Location
    },
    onSuccess: invalidate,
  })
}
