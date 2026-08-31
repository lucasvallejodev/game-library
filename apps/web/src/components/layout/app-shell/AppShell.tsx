import type { ReactNode } from 'react'

import { MobileNav } from '@/components/layout/sidebar/MobileNav'
import { Sidebar } from '@/components/layout/sidebar/Sidebar'
import type { SessionUser } from '@/lib/session'

import styles from './AppShell.module.scss'

export interface AppShellProps {
  user: SessionUser
  gameCount: number
  children: ReactNode
}

/**
 * Sidebar plus content pane — the two-column frame from the reference. The
 * sidebar sits on a darker surface than the content so it reads as chrome.
 */
export function AppShell({ user, gameCount, children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <Sidebar user={user} gameCount={gameCount} />
      <main className={styles.shell__main}>
        {/* Below md the fixed rail is hidden, so this is the only way to
            navigate. It disappears again from md up. */}
        <div className={styles['shell__mobile-bar']}>
          <MobileNav user={user} gameCount={gameCount} />
        </div>
        <div className={styles.shell__content}>{children}</div>
      </main>
    </div>
  )
}
