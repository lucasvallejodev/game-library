'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { Button } from '@/components/ui/button/Button'

import styles from './ConfirmDialog.module.scss'

export interface ConfirmOptions {
  title: string
  /**
   * What actually happens. Say the consequence plainly — most of these
   * dialogs exist to correct a fear, not to create one.
   */
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** `danger` for anything destructive; `default` for ordinary changes. */
  tone?: 'danger' | 'default'
}

type Resolver = (confirmed: boolean) => void

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null)

/**
 * One confirmation dialog for the whole app, driven imperatively.
 *
 * Replaces `window.confirm`, which cannot be styled, blocks the main thread,
 * and in some browsers can be suppressed entirely by the user — a "never show
 * this again" click would have silently turned every delete into a no-op.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<Resolver | null>(null)

  const confirm = useCallback((next: ConfirmOptions) => {
    setOptions(next)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = useCallback((confirmed: boolean) => {
    // Resolve before clearing, so a caller awaiting this never hangs if the
    // dialog is closed by Escape or an overlay click.
    resolver.current?.(confirmed)
    resolver.current = null
    setOptions(null)
  }, [])

  const value = useMemo(() => confirm, [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}

      <Dialog.Root
        open={options !== null}
        onOpenChange={(open) => {
          if (!open) settle(false)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={styles.confirm__overlay} />
          <Dialog.Content
            className={styles.confirm__panel}
            // Not a plain dialog: this interrupts a task and needs an answer,
            // which is what assistive tech announces differently.
            role="alertdialog"
          >
            {options && (
              <>
                <div className={styles.confirm__header}>
                  {options.tone !== 'default' && (
                    <span className={styles.confirm__icon} aria-hidden="true">
                      <AlertTriangle />
                    </span>
                  )}
                  <div>
                    <Dialog.Title className={styles.confirm__title}>{options.title}</Dialog.Title>
                    {options.description && (
                      <Dialog.Description className={styles.confirm__description}>
                        {options.description}
                      </Dialog.Description>
                    )}
                  </div>
                </div>

                {/* Cancel comes first so Radix's opening focus lands on it —
                    a stray Enter can never delete anything — and that is also
                    the conventional left-to-right order, so no CSS reordering
                    is needed. */}
                <div className={styles.confirm__actions}>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      settle(false)
                    }}
                  >
                    {options.cancelLabel ?? 'Cancel'}
                  </Button>
                  <Button
                    variant={options.tone === 'default' ? 'primary' : 'danger'}
                    onClick={() => {
                      settle(true)
                    }}
                  >
                    {options.confirmLabel ?? 'Confirm'}
                  </Button>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </ConfirmContext.Provider>
  )
}

/**
 * Ask for confirmation. Resolves true only if the user actively confirms —
 * Escape, the overlay and the close path all resolve false.
 */
export function useConfirm() {
  const confirm = useContext(ConfirmContext)
  if (!confirm) {
    throw new Error('useConfirm must be used inside <ConfirmProvider>')
  }
  return confirm
}
