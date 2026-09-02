'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, Gamepad2, HardDrive, Tags } from 'lucide-react'
import type { CSSProperties } from 'react'

import {
  useGameTaxonomy,
  type TaxonomyEditable,
} from '@/components/game/game-taxonomy/useGameTaxonomy'

import styles from './GameTaxonomyItems.module.scss'
import menuStyles from '@/components/ui/dropdown-menu/DropdownMenu.module.scss'

export interface GameTaxonomyItemsProps {
  game: TaxonomyEditable
  onError?: (message: string) => void
}

/**
 * Toggling must not close the menu — filing a game usually means picking more
 * than one thing, and a menu that shuts after every click makes that four
 * round trips instead of one.
 */
function keepOpen(event: Event) {
  event.preventDefault()
}

function Empty({ children }: { children: string }) {
  return <div className={styles.empty}>{children}</div>
}

/** Locations, multi-select. */
export function LocationItems({ game, onError }: GameTaxonomyItemsProps) {
  const editor = useGameTaxonomy(game, onError)
  const selected = new Set(game.locations.map((l) => l.id))

  if (editor.loading) return <Empty>Loading…</Empty>
  if (editor.locations.length === 0) {
    return <Empty>No locations yet. Create one on the Locations screen.</Empty>
  }

  return (
    <>
      {editor.locations.map((location) => (
        <DropdownMenu.CheckboxItem
          key={location.id}
          className={`${menuStyles.menu__item} ${
            selected.has(location.id) ? menuStyles['menu__item--checked'] : ''
          }`}
          checked={selected.has(location.id)}
          disabled={editor.pending}
          onSelect={keepOpen}
          onCheckedChange={() => {
            editor.toggleLocation(location.id)
          }}
        >
          <span
            className={styles.dot}
            style={{ '--dot-color': location.color } as CSSProperties}
            aria-hidden="true"
          />
          {location.name}
          {selected.has(location.id) && (
            <Check className={menuStyles.menu__check} aria-hidden="true" />
          )}
        </DropdownMenu.CheckboxItem>
      ))}
    </>
  )
}

/** Game type, single-select, with an explicit way back to none. */
export function GameTypeItems({ game, onError }: GameTaxonomyItemsProps) {
  const editor = useGameTaxonomy(game, onError)
  const current = game.gameType?.id ?? null

  if (editor.loading) return <Empty>Loading…</Empty>
  if (editor.gameTypes.length === 0) {
    return <Empty>No game types yet. Create one on the Game Types screen.</Empty>
  }

  return (
    <>
      {editor.gameTypes.map((type) => (
        <DropdownMenu.CheckboxItem
          key={type.id}
          className={`${menuStyles.menu__item} ${
            current === type.id ? menuStyles['menu__item--checked'] : ''
          }`}
          checked={current === type.id}
          disabled={editor.pending}
          onSelect={keepOpen}
          onCheckedChange={() => {
            // Selecting the current type again clears it, so the only route
            // back to "no type" is not a separate destructive-looking item.
            editor.setGameType(current === type.id ? null : type.id)
          }}
        >
          {type.name}
          {current === type.id && <Check className={menuStyles.menu__check} aria-hidden="true" />}
        </DropdownMenu.CheckboxItem>
      ))}

      <DropdownMenu.Separator className={menuStyles.menu__separator} />

      <DropdownMenu.Item
        className={menuStyles.menu__item}
        disabled={editor.pending || current === null}
        onSelect={keepOpen}
        onClick={() => {
          editor.setGameType(null)
        }}
      >
        Clear game type
      </DropdownMenu.Item>
    </>
  )
}

/** Genres, multi-select. */
export function GenreItems({ game, onError }: GameTaxonomyItemsProps) {
  const editor = useGameTaxonomy(game, onError)
  const selected = new Set(game.genres.map((g) => g.id))

  if (editor.loading) return <Empty>Loading…</Empty>
  if (editor.genres.length === 0) {
    return <Empty>No genres yet. Create one on the Genres screen.</Empty>
  }

  return (
    <div className={styles.scroll}>
      {editor.genres.map((genre) => (
        <DropdownMenu.CheckboxItem
          key={genre.id}
          className={`${menuStyles.menu__item} ${
            selected.has(genre.id) ? menuStyles['menu__item--checked'] : ''
          }`}
          checked={selected.has(genre.id)}
          disabled={editor.pending}
          onSelect={keepOpen}
          onCheckedChange={() => {
            editor.toggleGenre(genre.id)
          }}
        >
          {genre.name}
          {selected.has(genre.id) && (
            <Check className={menuStyles.menu__check} aria-hidden="true" />
          )}
        </DropdownMenu.CheckboxItem>
      ))}
    </div>
  )
}

/**
 * The three pickers as nested submenus, for use inside an existing menu —
 * the grid card's `···`. The detail page mounts the same item lists directly
 * under their own triggers instead.
 */
export function GameTaxonomySubmenus({ game, onError }: GameTaxonomyItemsProps) {
  const sections = [
    { label: 'Locations', icon: HardDrive, Items: LocationItems },
    { label: 'Game type', icon: Gamepad2, Items: GameTypeItems },
    { label: 'Genres', icon: Tags, Items: GenreItems },
  ]

  return (
    <>
      {sections.map(({ label, icon: Icon, Items }) => (
        <DropdownMenu.Sub key={label}>
          <DropdownMenu.SubTrigger className={menuStyles.menu__item}>
            <Icon aria-hidden="true" />
            {label}
            <span className={styles.chevron} aria-hidden="true">
              ›
            </span>
          </DropdownMenu.SubTrigger>
          <DropdownMenu.Portal>
            <DropdownMenu.SubContent
              className={menuStyles.menu}
              sideOffset={4}
              collisionPadding={8}
            >
              <Items game={game} onError={onError} />
            </DropdownMenu.SubContent>
          </DropdownMenu.Portal>
        </DropdownMenu.Sub>
      ))}
    </>
  )
}
