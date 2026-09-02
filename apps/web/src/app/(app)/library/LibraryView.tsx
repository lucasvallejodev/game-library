'use client'

import type { GameCard, GameList } from '@game-library/shared/schemas'
import { LayoutGrid, Plus } from 'lucide-react'
import { useState } from 'react'

import { AddGameDialog } from '@/components/game/add-game-dialog/AddGameDialog'
import { FilterBar } from '@/components/game/filter-bar/FilterBar'
import { GameGrid, type GameView } from '@/components/game/game-grid/GameGrid'
import { EmptyState } from '@/components/layout/empty-state/EmptyState'
import { Topbar } from '@/components/layout/topbar/Topbar'
import { useConfirm } from '@/components/ui/confirm-dialog/ConfirmDialog'
import { Button } from '@/components/ui/button/Button'
import { useDeleteGame, useGames } from '@/features/library/queries'
import { useLibraryFilters } from '@/features/library/useLibraryFilters'

export interface LibraryViewProps {
  /** Fetched by the server component, so first paint needs no round trip. */
  initialData: GameList
  /** The query string that produced `initialData`, to match the cache key. */
  initialQuery: string
}

export function LibraryView({ initialData, initialQuery }: LibraryViewProps) {
  const { filters, apiQuery, activeCount, toggle, setSort, setPage, clearAll } = useLibraryFilters()

  const [view, setView] = useState<GameView>('grid')
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [addOpen, setAddOpen] = useState(false)

  // Hand the server's payload to TanStack Query only when it answers the same
  // question; otherwise the first render of a filtered URL would show the
  // unfiltered list.
  const games = useGames(apiQuery, apiQuery === initialQuery ? initialData : undefined)
  const deleteGame = useDeleteGame()

  const data = games.data ?? { data: [], meta: { page: 1, perPage: 40, total: 0, totalPages: 1 } }
  const isFiltered = filters.q.length > 0 || activeCount > 0
  const isEmpty = data.data.length === 0 && !games.isPending
  const confirm = useConfirm()

  async function handleDelete(game: GameCard) {
    // A game is cheap to re-add from IGDB, but silently vanishing is alarming.
    const ok = await confirm({
      title: `Remove “${game.name}”?`,
      description:
        'It leaves your library entirely. Anything you own elsewhere is untouched, and an IGDB game can be added back in a few clicks.',
      confirmLabel: 'Remove',
    })
    if (!ok) return
    deleteGame.mutate(game.id)
  }

  return (
    <>
      <Topbar
        title="Library"
        view={view}
        onViewChange={setView}
        onAdd={() => {
          setAddOpen(true)
        }}
        onToggleFilters={() => {
          setFiltersOpen((open) => !open)
        }}
        filtersOpen={filtersOpen}
      />

      {filtersOpen && (
        <FilterBar
          locationIds={filters.locationIds}
          gameTypeIds={filters.gameTypeIds}
          genreIds={filters.genreIds}
          sort={filters.sort}
          activeCount={activeCount}
          onToggle={toggle}
          onSort={setSort}
          onClear={clearAll}
        />
      )}

      {isEmpty ? (
        <EmptyState
          icon={LayoutGrid}
          title={isFiltered ? 'Nothing matches those filters' : 'Your library is empty'}
          description={
            isFiltered
              ? 'Try removing a filter, or clear them all to see everything you own.'
              : 'Add your first game and it will show up here, with cover art pulled from IGDB.'
          }
          action={
            isFiltered ? (
              <Button variant="secondary" onClick={clearAll}>
                Clear filters
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => {
                  setAddOpen(true)
                }}
              >
                <Plus aria-hidden="true" />
                Add a game
              </Button>
            )
          }
        />
      ) : (
        <GameGrid
          data={data}
          view={view}
          loading={games.isPending || games.isFetching}
          onDelete={(game) => void handleDelete(game)}
          onPageChange={setPage}
        />
      )}

      <AddGameDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  )
}
