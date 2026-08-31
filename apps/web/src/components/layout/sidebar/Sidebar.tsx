'use client'

import type { SessionUser } from '@/lib/session'

import styles from './Sidebar.module.scss'
import { SidebarContent } from './SidebarContent'

export interface SidebarProps {
  user: SessionUser
  gameCount: number
}

/** The fixed rail, shown from the md breakpoint up. */
export function Sidebar({ user, gameCount }: SidebarProps) {
  return (
    <nav className={styles.sidebar} aria-label="Main">
      <SidebarContent user={user} gameCount={gameCount} />
    </nav>
  )
}
