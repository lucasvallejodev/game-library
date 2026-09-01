'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import clsx from 'clsx'
import { ArrowUpDown, Check, ChevronDown, X } from 'lucide-react'

import { Button } from '@/components/ui/button/Button'
import type { FilterKey, GameSort } from '@/features/library/useLibraryFilters'
import { useTaxonomy } from '@/features/library/queries'

import menuStyles from '@/components/ui/dropdown-menu/DropdownMenu.module.scss'
import styles from './FilterBar.module.scss'

interface Option {
  id: string
  name: string
  count?: number
}

interface FacetProps {
  label: string
  options: Option[]
  selected: string[]
  onToggle: (id: string) => void
}

/**
 * One multi-select facet.
 *
 * Radix DropdownMenu with `CheckboxItem`, which brings the roving focus,
 * Escape handling and `aria-checked` wiring; every pixel of appearance is
 * ours. See ADR-006.
 */
function Facet({ label, options, selected, onToggle }: FacetProps) {
  const active = selected.length > 0

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={clsx(styles.facet__trigger, active && styles['facet__trigger--active'])}
      >
        {label}
        {active && <span className={styles.facet__count}>{selected.length}</span>}
        <ChevronDown aria-hidden="true" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className={menuStyles.menu} sideOffset={4} collisionPadding={8}>
          <div className={styles.facet__list}>
            {options.length === 0 ? (
              <p className={styles.facet__empty}>Nothing to filter by yet.</p>
            ) : (
              options.map((option) => {
                const checked = selected.includes(option.id)
                return (
                  <DropdownMenu.CheckboxItem
                    key={option.id}
                    checked={checked}
                    // Keep the menu open: choosing several values in a row is
                    // the normal case for a facet.
                    onSelect={(event) => {
                      event.preventDefault()
                      onToggle(option.id)
                    }}
                    className={clsx(
                      menuStyles.menu__item,
                      checked && menuStyles['menu__item--checked'],
                    )}
                  >
                    {option.name}
                    {checked && <Check className={menuStyles.menu__check} aria-hidden="true" />}
                  </DropdownMenu.CheckboxItem>
                )
              })
            )}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

const SORT_OPTIONS: { value: GameSort; label: string }[] = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: '-name', label: 'Name (Z–A)' },
  { value: '-createdAt', label: 'Recently added' },
  { value: 'createdAt', label: 'Oldest first' },
  { value: '-releaseDate', label: 'Newest release' },
  { value: 'releaseDate', label: 'Oldest release' },
  { value: '-rating', label: 'Highest rated' },
]

export interface FilterBarProps {
  locationIds: string[]
  gameTypeIds: string[]
  genreIds: string[]
  sort: GameSort
  activeCount: number
  onToggle: (key: FilterKey, id: string) => void
  onSort: (sort: GameSort) => void
  onClear: () => void
}

export function FilterBar({
  locationIds,
  gameTypeIds,
  genreIds,
  sort,
  activeCount,
  onToggle,
  onSort,
  onClear,
}: FilterBarProps) {
  const { data: taxonomy } = useTaxonomy()

  const sortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label ?? 'Name (A–Z)'

  return (
    <div className={styles['filter-bar']}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className={styles.facet__trigger}>
          <ArrowUpDown aria-hidden="true" />
          {sortLabel}
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={menuStyles.menu} sideOffset={4} collisionPadding={8}>
            {SORT_OPTIONS.map((option) => (
              <DropdownMenu.Item
                key={option.value}
                className={clsx(
                  menuStyles.menu__item,
                  option.value === sort && menuStyles['menu__item--checked'],
                )}
                onSelect={() => {
                  onSort(option.value)
                }}
              >
                {option.label}
                {option.value === sort && (
                  <Check className={menuStyles.menu__check} aria-hidden="true" />
                )}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Facet
        label="Location"
        options={taxonomy?.locations ?? []}
        selected={locationIds}
        onToggle={(id) => {
          onToggle('locationId', id)
        }}
      />
      <Facet
        label="Type"
        options={taxonomy?.gameTypes ?? []}
        selected={gameTypeIds}
        onToggle={(id) => {
          onToggle('gameTypeId', id)
        }}
      />
      <Facet
        label="Genre"
        options={taxonomy?.genres ?? []}
        selected={genreIds}
        onToggle={(id) => {
          onToggle('genreId', id)
        }}
      />

      {activeCount > 0 && (
        <Button variant="ghost" className={styles['filter-bar__clear']} onClick={onClear}>
          <X aria-hidden="true" />
          Clear {activeCount}
        </Button>
      )}
    </div>
  )
}
