'use client'

import type { GameCard, GameDetail } from '@game-library/shared/schemas'

import { useTaxonomy, useUpdateGame } from '@/features/library/queries'

/** Either shape works — both carry the fields the pickers read and write. */
export type TaxonomyEditable = GameCard | GameDetail

export interface GameTaxonomyEditor {
  locations: { id: string; name: string; color: string }[]
  gameTypes: { id: string; name: string }[]
  genres: { id: string; name: string }[]
  loading: boolean
  pending: boolean
  toggleLocation: (id: string) => void
  setGameType: (id: string | null) => void
  toggleGenre: (id: string) => void
}

/**
 * Editing state for a game's filing — locations, type and genres.
 *
 * The API replaces the whole set on PATCH, so a toggle sends the full array
 * rather than a delta. Sending the current set plus or minus one is the only
 * way to express "remove this location" through that contract.
 */
export function useGameTaxonomy(
  game: TaxonomyEditable,
  onError?: (message: string) => void,
): GameTaxonomyEditor {
  const taxonomy = useTaxonomy()
  const update = useUpdateGame(game.id)

  function save(body: Record<string, unknown>, whatFailed: string) {
    update.mutate(body, {
      onError: (err) => {
        onError?.(err instanceof Error ? err.message : `Could not update ${whatFailed}.`)
      },
    })
  }

  return {
    locations: taxonomy.data?.locations ?? [],
    gameTypes: taxonomy.data?.gameTypes ?? [],
    genres: taxonomy.data?.genres ?? [],
    loading: taxonomy.isLoading,
    pending: update.isPending,

    toggleLocation: (id) => {
      const current = game.locations.map((l) => l.id)
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
      save({ locationIds: next }, 'the locations')
    },

    // null clears the type; the column is nullable and the API accepts it.
    setGameType: (id) => {
      save({ gameTypeId: id }, 'the game type')
    },

    toggleGenre: (id) => {
      const current = game.genres.map((g) => g.id)
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
      save({ genreIds: next }, 'the genres')
    },
  }
}
