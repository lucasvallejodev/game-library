'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo } from 'react'

export type GameSort =
  | 'name'
  | '-name'
  | 'createdAt'
  | '-createdAt'
  | 'releaseDate'
  | '-releaseDate'
  | 'rating'
  | '-rating'

export interface LibraryFilters {
  q: string
  locationIds: string[]
  gameTypeIds: string[]
  genreIds: string[]
  sort: GameSort
  page: number
}

export type FilterKey = 'locationId' | 'gameTypeId' | 'genreId'

const DEFAULT_SORT: GameSort = 'name'

/**
 * The single place library filter state is read or written.
 *
 * State lives in the URL rather than React state, so a filtered view is
 * shareable, survives a refresh, and behaves correctly with the back button —
 * none of which needs extra code. TanStack Query keys derive from this, so
 * navigating back also restores the right cache entry.
 * See docs/frontend-guidelines.md §7.
 */
export function useLibraryFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const filters = useMemo<LibraryFilters>(
    () => ({
      q: searchParams.get('q') ?? '',
      locationIds: searchParams.getAll('locationId'),
      gameTypeIds: searchParams.getAll('gameTypeId'),
      genreIds: searchParams.getAll('genreId'),
      sort: (searchParams.get('sort') as GameSort | null) ?? DEFAULT_SORT,
      page: Math.max(1, Number(searchParams.get('page') ?? '1') || 1),
    }),
    [searchParams],
  )

  const push = useCallback(
    (next: URLSearchParams) => {
      const query = next.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [pathname, router],
  )

  /** Add or remove one value of a repeatable filter. */
  const toggle = useCallback(
    (key: FilterKey, value: string) => {
      const next = new URLSearchParams(searchParams.toString())
      const current = next.getAll(key)

      next.delete(key)
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
      for (const v of updated) next.append(key, v)

      // Any filter change returns to page 1; staying on page 4 of the previous
      // result set looks indistinguishable from an empty library.
      next.delete('page')
      push(next)
    },
    [push, searchParams],
  )

  const setSort = useCallback(
    (sort: GameSort) => {
      const next = new URLSearchParams(searchParams.toString())
      if (sort === DEFAULT_SORT) next.delete('sort')
      else next.set('sort', sort)
      next.delete('page')
      push(next)
    },
    [push, searchParams],
  )

  const setPage = useCallback(
    (page: number) => {
      const next = new URLSearchParams(searchParams.toString())
      if (page <= 1) next.delete('page')
      else next.set('page', String(page))
      push(next)
    },
    [push, searchParams],
  )

  const clearAll = useCallback(() => {
    // `q` is owned by the sidebar search, so clearing the facets leaves it be.
    const next = new URLSearchParams()
    const q = searchParams.get('q')
    if (q) next.set('q', q)
    push(next)
  }, [push, searchParams])

  const activeCount =
    filters.locationIds.length + filters.gameTypeIds.length + filters.genreIds.length

  /** The query string sent to the API — identical shape to the URL's own. */
  const apiQuery = useMemo(() => {
    const params = new URLSearchParams()
    if (filters.q) params.set('q', filters.q)
    for (const id of filters.locationIds) params.append('locationId', id)
    for (const id of filters.gameTypeIds) params.append('gameTypeId', id)
    for (const id of filters.genreIds) params.append('genreId', id)
    if (filters.sort !== DEFAULT_SORT) params.set('sort', filters.sort)
    if (filters.page > 1) params.set('page', String(filters.page))
    return params.toString()
  }, [filters])

  return { filters, apiQuery, activeCount, toggle, setSort, setPage, clearAll }
}
