import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import styles from './EmptyState.module.scss'

export interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
}

/** Shown wherever a list is legitimately empty — not an error, just nothing yet. */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <div className={styles.empty__icon}>
        <Icon aria-hidden="true" />
      </div>
      <h2 className={styles.empty__title}>{title}</h2>
      <p className={styles.empty__description}>{description}</p>
      {action && <div className={styles.empty__action}>{action}</div>}
    </div>
  )
}
