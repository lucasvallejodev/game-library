'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { GameCard as GameCardData } from '@game-library/shared/schemas'
import { Gamepad2, MoreHorizontal, Trash2 } from 'lucide-react'

import { LocationChip } from '@/components/game/location-chip/LocationChip'
import { mediaUrl } from '@/lib/api-client'

import menuStyles from '@/components/ui/dropdown-menu/DropdownMenu.module.scss'
import styles from './GameCard.module.scss'

export interface GameCardProps {
  game: GameCardData
  onDelete: (game: GameCardData) => void
}

/**
 * One cover card: 3:4 portrait, title row with a `···` menu, then location
 * chips — the card anatomy from the reference.
 */
export function GameCard({ game, onDelete }: GameCardProps) {
  const cover = mediaUrl(game.thumbUrl ?? game.coverUrl)
  const year = game.releaseDate?.slice(0, 4)

  return (
    <article className={styles['game-card']}>
      <div className={styles['game-card__cover']}>
        {cover ? (
          // Served by our own API behind an ownership check, not a public
          // CDN, so next/image's optimiser would have nothing to add.
          <img
            className={styles['game-card__image']}
            src={cover}
            alt={`${game.name} cover`}
            loading="lazy"
          />
        ) : (
          <div className={styles['game-card__placeholder']} aria-hidden="true">
            <Gamepad2 />
          </div>
        )}
      </div>

      <div className={styles['game-card__header']}>
        <h3 className={styles['game-card__title']} title={game.name}>
          {game.name}
        </h3>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            className={styles['game-card__menu-trigger']}
            aria-label={`Actions for ${game.name}`}
          >
            <MoreHorizontal aria-hidden="true" />
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className={menuStyles.menu}
              sideOffset={4}
              align="end"
              collisionPadding={8}
            >
              <DropdownMenu.Item
                className={`${menuStyles.menu__item} ${menuStyles['menu__item--danger']}`}
                onSelect={() => {
                  onDelete(game)
                }}
              >
                <Trash2 aria-hidden="true" />
                Remove from library
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <div className={styles['game-card__meta']}>
        {game.locations.length > 0 ? (
          game.locations.map((location) => (
            <LocationChip key={location.id} name={location.name} color={location.color} />
          ))
        ) : (
          <span className={styles['game-card__year']}>{year ?? 'No location'}</span>
        )}
        {game.locations.length > 0 && year && (
          <span className={styles['game-card__year']}>{year}</span>
        )}
      </div>
    </article>
  )
}
