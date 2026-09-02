'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button/Button'
import {
  useCreateTaxonomy,
  useUpdateTaxonomy,
  type TaxonomyItem,
  type TaxonomyKind,
} from '@/features/taxonomy/queries'
import { ApiError } from '@/lib/api-client'

import styles from './TaxonomyDialog.module.scss'

export interface TaxonomyDialogProps {
  kind: TaxonomyKind
  /** Singular noun for the copy — "game type", "genre". */
  noun: string
  placeholder: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when renaming; omitted when creating. */
  item?: TaxonomyItem | null
}

/**
 * Create or rename a game type or genre. Name is the only editable field —
 * the slug is derived server-side, and `isDefault` is set by the signup seed.
 */
export function TaxonomyDialog({
  kind,
  noun,
  placeholder,
  open,
  onOpenChange,
  item,
}: TaxonomyDialogProps) {
  const editing = Boolean(item)

  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const create = useCreateTaxonomy(kind)
  const update = useUpdateTaxonomy(kind)
  const pending = create.isPending || update.isPending

  // Reset on each open, so a cancelled rename does not leak into the next
  // create and vice versa.
  useEffect(() => {
    if (!open) return
    setName(item?.name ?? '')
    setError(null)
  }, [open, item])

  const canSubmit = name.trim().length > 0 && !pending

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    setError(null)

    try {
      if (item) {
        await update.mutateAsync({ id: item.id, name: name.trim() })
      } else {
        await create.mutateAsync({ name: name.trim() })
      }
      onOpenChange(false)
    } catch (err) {
      // A 409 means the name collides after slugging; the API's own message
      // explains that better than a generic failure would.
      setError(err instanceof ApiError ? err.message : `Could not save that ${noun}.`)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialog__overlay} />
        <Dialog.Content className={styles.dialog__panel}>
          <div className={styles.dialog__header}>
            <div>
              <Dialog.Title className={styles.dialog__title}>
                {editing ? `Rename ${noun}` : `New ${noun}`}
              </Dialog.Title>
              <Dialog.Description className={styles.dialog__description}>
                {editing
                  ? 'Renaming keeps every game already filed under it.'
                  : `Your own ${noun}s sit alongside the seeded ones.`}
              </Dialog.Description>
            </div>
            <Dialog.Close className={styles.dialog__close} aria-label="Close">
              <X aria-hidden="true" />
            </Dialog.Close>
          </div>

          <form className={styles.dialog__form} onSubmit={(e) => void handleSubmit(e)} noValidate>
            {error && (
              <div className={styles.dialog__error} role="alert">
                {error}
              </div>
            )}

            <div className={styles.dialog__field}>
              <label className={styles.dialog__label} htmlFor="taxonomy-name">
                Name
              </label>
              <input
                id="taxonomy-name"
                className={styles.dialog__input}
                placeholder={placeholder}
                value={name}
                autoFocus
                maxLength={100}
                onChange={(event) => {
                  setName(event.target.value)
                }}
              />
            </div>

            <div className={styles.dialog__actions}>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  onOpenChange(false)
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!canSubmit}>
                {pending ? 'Saving…' : editing ? 'Save changes' : `Create ${noun}`}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
