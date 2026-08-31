'use client'

import type { GameList } from '@game-library/shared/schemas'
import { LayoutGrid } from 'lucide-react'
import { useState } from 'react'

import { EmptyState } from '@/components/layout/empty-state/EmptyState'
import { Topbar } from '@/components/layout/topbar/Topbar'

export interface LibraryViewProps {
  initialData: GameList
  query: string
}

/**
 * The Library shell.
 *
 * The grid itself, the filter bar and the add dialog arrive in increment 11 —
 * this establishes the toolbar and empty states so the layout can be judged
 * against the reference now.
 */
export function LibraryView({ initialData, query }: LibraryViewProps) {
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const isSearch = query.length > 0
  const isEmpty = initialData.data.length === 0

  return (
    <>
      <Topbar
        title="Library"
        view={view}
        onViewChange={setView}
        onToggleFilters={() => {
          setFiltersOpen((open) => !open)
        }}
        filtersOpen={filtersOpen}
      />

      {isEmpty ? (
        <EmptyState
          icon={LayoutGrid}
          title={isSearch ? 'Nothing matches that search' : 'Your library is empty'}
          description={
            isSearch
              ? `No games match “${query}”. Try a shorter search, or clear it to see everything.`
              : 'Add your first game and it will show up here, with covers pulled from IGDB.'
          }
        />
      ) : (
        <p>
          {initialData.meta.total} {initialData.meta.total === 1 ? 'game' : 'games'}
        </p>
      )}
    </>
  )
}
