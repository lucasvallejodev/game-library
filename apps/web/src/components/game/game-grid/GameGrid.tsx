'use client'

import type { GameCard as GameCardData, GameList } from '@game-library/shared/schemas'
import { Gamepad2 } from 'lucide-react'

import { GameCard } from '@/components/game/game-card/GameCard'
import { LocationChip } from '@/components/game/location-chip/LocationChip'
import { Button } from '@/components/ui/button/Button'
import { mediaUrl } from '@/lib/api-client'

import styles from './GameGrid.module.scss'

export type GameView = 'grid' | 'list'

export interface GameGridProps {
  data: GameList
  view: GameView
  loading?: boolean
  onDelete: (game: GameCardData) => void
  onPageChange: (page: number) => void
}

/** Placeholder cards so the grid does not collapse while a filter is applied. */
function Skeletons({ count = 12 }: { count?: number }) {
  return (
    <div className={styles.grid} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.skeleton} />
      ))}
    </div>
  )
}

function GameRow({ game }: { game: GameCardData }) {
  const cover = mediaUrl(game.thumbUrl ?? game.coverUrl)

  return (
    <div className={styles.row}>
      <div className={styles.row__cover}>
        {cover ? (
          // Served by our own API behind an ownership check.
          <img className={styles.row__image} src={cover} alt="" loading="lazy" />
        ) : (
          <Gamepad2 size={14} aria-hidden="true" />
        )}
      </div>
      <span className={styles.row__name}>{game.name}</span>
      <div className={styles.row__locations}>
        {game.locations.map((l) => (
          <LocationChip key={l.id} name={l.name} color={l.color} />
        ))}
      </div>
      {game.gameType && <span className={styles.row__type}>{game.gameType.name}</span>}
      {game.releaseDate && <span className={styles.row__year}>{game.releaseDate.slice(0, 4)}</span>}
    </div>
  )
}

export function GameGrid({ data, view, loading, onDelete, onPageChange }: GameGridProps) {
  const { page, totalPages, total } = data.meta

  if (loading && data.data.length === 0) return <Skeletons />

  return (
    <>
      {view === 'grid' ? (
        <div className={styles.grid}>
          {data.data.map((game) => (
            <GameCard key={game.id} game={game} onDelete={onDelete} />
          ))}
        </div>
      ) : (
        <div className={styles.list}>
          {data.data.map((game) => (
            <GameRow key={game.id} game={game} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav className={styles.pagination} aria-label="Pagination">
          <Button
            variant="ghost"
            disabled={page <= 1}
            onClick={() => {
              onPageChange(page - 1)
            }}
          >
            Previous
          </Button>
          <span className={styles.pagination__page}>
            Page {page} of {totalPages} · {total} games
          </span>
          <Button
            variant="ghost"
            disabled={page >= totalPages}
            onClick={() => {
              onPageChange(page + 1)
            }}
          >
            Next
          </Button>
        </nav>
      )}
    </>
  )
}
