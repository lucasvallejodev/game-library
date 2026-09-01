'use client'

import type {
  GameDetail,
  GameList,
  GameType,
  Genre,
  IgdbGame,
  Location,
} from '@game-library/shared/schemas'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'

import { apiFetch } from '@/lib/api-client'

/**
 * Query keys mirror the filter state, so cache entries are precise: changing
 * one facet does not invalidate the others, and going back restores the exact
 * page you left. See docs/frontend-guidelines.md §7.
 */
export const queryKeys = {
  games: (apiQuery: string) => ['games', apiQuery] as const,
  taxonomy: ['taxonomy'] as const,
  igdbSearch: (q: string) => ['igdb', 'search', q] as const,
}

export interface Taxonomy {
  locations: Location[]
  gameTypes: GameType[]
  genres: Genre[]
}

export function useGames(apiQuery: string, initialData?: GameList) {
  return useQuery({
    queryKey: queryKeys.games(apiQuery),
    queryFn: () => apiFetch<GameList>(`/api/games?${apiQuery}`),
    // The server component already fetched the first page; handing it over as
    // initialData means no spinner on entry for the unfiltered view.
    ...(initialData ? { initialData } : {}),
    placeholderData: (previous: GameList | undefined) => previous,
  })
}

/** All three taxonomies in one query: they change rarely and are always needed together. */
export function useTaxonomy() {
  return useQuery({
    queryKey: queryKeys.taxonomy,
    queryFn: async (): Promise<Taxonomy> => {
      const [locations, gameTypes, genres] = await Promise.all([
        apiFetch<{ data: Location[] }>('/api/locations'),
        apiFetch<{ data: GameType[] }>('/api/game-types'),
        apiFetch<{ data: Genre[] }>('/api/genres'),
      ])
      return { locations: locations.data, gameTypes: gameTypes.data, genres: genres.data }
    },
    staleTime: 5 * 60_000,
  })
}

export function useIgdbSearch(term: string) {
  return useQuery({
    queryKey: queryKeys.igdbSearch(term),
    queryFn: () =>
      apiFetch<{ data: IgdbGame[] }>(`/api/igdb/search?q=${encodeURIComponent(term)}&limit=20`),
    // Two characters is the API's own minimum; below that there is nothing to
    // ask for, and an upstream call would be wasted.
    enabled: term.trim().length >= 2,
    staleTime: 5 * 60_000,
  })
}

export function useCreateGame() {
  const client = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<GameDetail>('/api/games', { method: 'POST', body }),
    onSuccess: async () => {
      // Every games query is stale now, and so are the taxonomy counts — an
      // IGDB import can create genres. The IGDB cache too: results carry an
      // `inLibrary` flag that has just changed.
      await Promise.all([
        client.invalidateQueries({ queryKey: ['games'] }),
        client.invalidateQueries({ queryKey: queryKeys.taxonomy }),
        client.invalidateQueries({ queryKey: ['igdb'] }),
      ])
      // The sidebar count is rendered by a Server Component, which a client
      // mutation cannot reach. Without this it keeps reporting the old total.
      router.refresh()
    },
  })
}

export function useDeleteGame() {
  const client = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/games/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['games'] }),
        client.invalidateQueries({ queryKey: ['igdb'] }),
      ])
      router.refresh()
    },
  })
}
