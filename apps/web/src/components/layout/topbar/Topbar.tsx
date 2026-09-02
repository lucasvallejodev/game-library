'use client'

import clsx from 'clsx'
import { LayoutGrid, List, Plus, SlidersHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'

import styles from './Topbar.module.scss'

export interface TopbarProps {
  title: string
  /** Sort and filter controls, rendered on the left as in the reference. */
  controls?: ReactNode
  view?: 'grid' | 'list'
  onViewChange?: (view: 'grid' | 'list') => void
  onAdd?: () => void
  /** Screen-reader label for the add button; the icon alone is ambiguous. */
  addLabel?: string
  onToggleFilters?: () => void
  filtersOpen?: boolean
}

/**
 * The reference toolbar: sort/filter on the left, then add, view toggle and
 * advanced filters pushed to the right edge.
 */
export function Topbar({
  title,
  controls,
  view = 'grid',
  onViewChange,
  onAdd,
  addLabel = 'Add a game',
  onToggleFilters,
  filtersOpen = false,
}: TopbarProps) {
  return (
    <div className={styles.topbar}>
      <h1 className={styles.topbar__title}>{title}</h1>

      {controls && <div className={styles.topbar__controls}>{controls}</div>}

      <div className={styles.topbar__spacer} />

      <div className={styles.topbar__actions}>
        {onAdd && (
          <button
            type="button"
            className={styles['icon-button']}
            onClick={onAdd}
            aria-label={addLabel}
          >
            <Plus aria-hidden="true" />
          </button>
        )}

        {onViewChange && (
          <>
            <button
              type="button"
              className={clsx(
                styles['icon-button'],
                view === 'grid' && styles['icon-button--active'],
              )}
              onClick={() => {
                onViewChange('grid')
              }}
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
            >
              <LayoutGrid aria-hidden="true" />
            </button>
            <button
              type="button"
              className={clsx(
                styles['icon-button'],
                view === 'list' && styles['icon-button--active'],
              )}
              onClick={() => {
                onViewChange('list')
              }}
              aria-label="List view"
              aria-pressed={view === 'list'}
            >
              <List aria-hidden="true" />
            </button>
          </>
        )}

        {onToggleFilters && (
          <button
            type="button"
            className={clsx(styles['icon-button'], filtersOpen && styles['icon-button--active'])}
            onClick={onToggleFilters}
            aria-label="Filters"
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
