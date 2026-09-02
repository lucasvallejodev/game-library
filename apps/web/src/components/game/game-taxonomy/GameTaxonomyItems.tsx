'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, Gamepad2, HardDrive, Search, Tags } from 'lucide-react'
import { useState, type CSSProperties, type ReactNode } from 'react'

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
 * Above this many rows the list scrolls, so it also gets a filter. Matches the
 * max-height in the stylesheet: the filter appears exactly when a scrollbar
 * would otherwise be the only way through the list.
 */
const FILTER_THRESHOLD = 8

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

interface PickerListProps<T> {
  items: T[]
  noun: string
  loading: boolean
  emptyMessage: string
  renderItem: (item: T) => ReactNode
  /** Rendered under the list — the "Clear game type" escape hatch. */
  footer?: ReactNode
}

/**
 * The scrolling body shared by all three pickers, with a filter that appears
 * only once the list outgrows its container.
 */
function PickerList<T extends { id: string; name: string }>({
  items,
  noun,
  loading,
  emptyMessage,
  renderItem,
  footer,
}: PickerListProps<T>) {
  const [filter, setFilter] = useState('')

  if (loading) return <Empty>Loading…</Empty>
  if (items.length === 0) return <Empty>{emptyMessage}</Empty>

  const showFilter = items.length > FILTER_THRESHOLD
  const needle = filter.trim().toLowerCase()
  const visible = needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items

  return (
    <>
      {showFilter && (
        <div className={styles.filter}>
          <Search className={styles.filter__icon} aria-hidden="true" />
          <input
            className={styles.filter__input}
            type="text"
            placeholder={`Filter ${noun}…`}
            aria-label={`Filter ${noun}`}
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value)
            }}
            onKeyDown={(event) => {
              // The menu's own typeahead would otherwise swallow these
              // keystrokes and jump between items instead of typing. Escape
              // is left alone so it still closes the menu.
              if (event.key !== 'Escape') event.stopPropagation()
            }}
          />
        </div>
      )}

      <div className={styles.scroll}>
        {visible.length === 0 ? (
          <Empty>{`Nothing matches “${filter.trim()}”.`}</Empty>
        ) : (
          visible.map(renderItem)
        )}
      </div>

      {footer}
    </>
  )
}

function itemClass(checked: boolean): string {
  return `${menuStyles.menu__item} ${checked ? menuStyles['menu__item--checked'] : ''}`
}

/** Locations, multi-select. */
export function LocationItems({ game, onError }: GameTaxonomyItemsProps) {
  const editor = useGameTaxonomy(game, onError)
  const selected = new Set(game.locations.map((l) => l.id))

  return (
    <PickerList
      items={editor.locations}
      noun="locations"
      loading={editor.loading}
      emptyMessage="No locations yet. Create one on the Locations screen."
      renderItem={(location) => (
        <DropdownMenu.CheckboxItem
          key={location.id}
          className={itemClass(selected.has(location.id))}
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
      )}
    />
  )
}

/** Game type, single-select, with an explicit way back to none. */
export function GameTypeItems({ game, onError }: GameTaxonomyItemsProps) {
  const editor = useGameTaxonomy(game, onError)
  const current = game.gameType?.id ?? null

  return (
    <PickerList
      items={editor.gameTypes}
      noun="game types"
      loading={editor.loading}
      emptyMessage="No game types yet. Create one on the Game Types screen."
      renderItem={(type) => (
        <DropdownMenu.CheckboxItem
          key={type.id}
          className={itemClass(current === type.id)}
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
      )}
      footer={
        <>
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
      }
    />
  )
}

/** Genres, multi-select. */
export function GenreItems({ game, onError }: GameTaxonomyItemsProps) {
  const editor = useGameTaxonomy(game, onError)
  const selected = new Set(game.genres.map((g) => g.id))

  return (
    <PickerList
      items={editor.genres}
      noun="genres"
      loading={editor.loading}
      emptyMessage="No genres yet. Create one on the Genres screen."
      renderItem={(genre) => (
        <DropdownMenu.CheckboxItem
          key={genre.id}
          className={itemClass(selected.has(genre.id))}
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
      )}
    />
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
