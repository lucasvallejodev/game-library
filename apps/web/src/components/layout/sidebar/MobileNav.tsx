'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { Menu, X } from 'lucide-react'
import { useState } from 'react'

import type { SessionUser } from '@/lib/session'

import styles from './MobileNav.module.scss'
import { SidebarContent } from './SidebarContent'

export interface MobileNavProps {
  user: SessionUser
  gameCount: number
}

/**
 * Navigation below the md breakpoint, where the fixed sidebar is hidden.
 *
 * Radix Dialog rather than a hand-rolled drawer: it brings the focus trap,
 * Escape handling, scroll lock and `aria-modal` wiring — the parts that are
 * easy to get subtly wrong. Every pixel of appearance is still ours.
 * See ADR-006.
 */
export function MobileNav({ user, gameCount }: MobileNavProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={styles['mobile-nav__trigger']} aria-label="Open navigation">
        <Menu aria-hidden="true" />
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className={styles['mobile-nav__overlay']} />
        <Dialog.Content className={styles['mobile-nav__panel']} aria-label="Main navigation">
          <Dialog.Title className={styles['mobile-nav__title']}>Navigation</Dialog.Title>
          <Dialog.Close className={styles['mobile-nav__close']} aria-label="Close navigation">
            <X aria-hidden="true" />
          </Dialog.Close>

          <SidebarContent
            user={user}
            gameCount={gameCount}
            onNavigate={() => {
              setOpen(false)
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
