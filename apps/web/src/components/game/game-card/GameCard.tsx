'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { GameCard as GameCardData } from '@game-library/shared/schemas'
import { Gamepad2, Info, MoreHorizontal, Trash2 } from 'lucide-react'
import Link from 'next/link'

import { GameTaxonomySubmenus } from '@/components/game/game-taxonomy/GameTaxonomyItems'
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
      <Link
        href={`/library/${game.id}`}
        className={styles['game-card__cover']}
        tabIndex={-1}
        aria-hidden="true"
      >
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
      </Link>

      <div className={styles['game-card__header']}>
        {/* The title carries the accessible link; the cover above repeats it
            for pointer users and is hidden from assistive tech. */}
        <h3 className={styles['game-card__title']} title={game.name}>
          <Link href={`/library/${game.id}`} className={styles['game-card__link']}>
            {game.name}
          </Link>
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
              <DropdownMenu.Item asChild className={menuStyles.menu__item}>
                <Link href={`/library/${game.id}`}>
                  <Info aria-hidden="true" />
                  View details
                </Link>
              </DropdownMenu.Item>

              <DropdownMenu.Separator className={menuStyles.menu__separator} />
              <DropdownMenu.Label className={menuStyles.menu__label}>Filing</DropdownMenu.Label>

              {/* Same pickers as the detail page, so filing a game never
                  requires leaving the grid. */}
              <GameTaxonomySubmenus game={game} />

              <DropdownMenu.Separator className={menuStyles.menu__separator} />

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
