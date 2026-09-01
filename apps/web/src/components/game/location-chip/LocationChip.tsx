import type { CSSProperties } from 'react'

import styles from './LocationChip.module.scss'

export interface LocationChipProps {
  name: string
  color: string
}

/**
 * A location marker.
 *
 * The colour is user-chosen hex with no guaranteed contrast, so it is never
 * the sole carrier of meaning — the name is always shown beside it.
 * See docs/frontend-guidelines.md §8.
 */
export function LocationChip({ name, color }: LocationChipProps) {
  return (
    <span className={styles.chip} style={{ '--chip-color': color } as CSSProperties}>
      <span className={styles.chip__dot} aria-hidden="true" />
      <span className={styles.chip__label}>{name}</span>
    </span>
  )
}
