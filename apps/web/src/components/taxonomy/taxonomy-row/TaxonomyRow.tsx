'use client'

import { Pencil, Trash2 } from 'lucide-react'

import type { TaxonomyItem } from '@/features/taxonomy/queries'

import styles from './TaxonomyRow.module.scss'

export interface TaxonomyRowProps {
  item: TaxonomyItem
  onRename: (item: TaxonomyItem) => void
  onDelete: (item: TaxonomyItem) => void
  busy?: boolean
}

export function TaxonomyRow({ item, onRename, onDelete, busy }: TaxonomyRowProps) {
  return (
    <article className={styles.row}>
      <div className={styles.row__body}>
        <div className={styles.row__heading}>
          <span className={styles.row__name}>{item.name}</span>
          {/* Seeded at signup. Marked, but still fully editable — these are the
              user's own rows, not a shared lookup table. */}
          {item.isDefault && <span className={styles.row__tag}>Default</span>}
        </div>
        <div className={styles.row__meta}>
          <span>
            {item.gameCount} {item.gameCount === 1 ? 'game' : 'games'}
          </span>
          <span className={styles.row__slug}>{item.slug}</span>
        </div>
      </div>

      <div className={styles.row__actions}>
        <button
          type="button"
          className={styles['row__icon-button']}
          disabled={busy}
          aria-label={`Rename ${item.name}`}
          onClick={() => {
            onRename(item)
          }}
        >
          <Pencil aria-hidden="true" />
        </button>

        <button
          type="button"
          className={`${styles['row__icon-button']} ${styles['row__icon-button--danger']}`}
          disabled={busy}
          aria-label={`Delete ${item.name}`}
          onClick={() => {
            onDelete(item)
          }}
        >
          <Trash2 aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}
