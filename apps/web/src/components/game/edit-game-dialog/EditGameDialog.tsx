'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button/Button'
import { useUpdateGame } from '@/features/library/queries'
import { ApiError } from '@/lib/api-client'

import styles from './EditGameDialog.module.scss'

/** The fields this dialog owns. Notes are edited in place on the detail page. */
export interface EditableGame {
  id: string
  name: string
  summary?: string | null
  releaseDate?: string | null
  acquiredAt?: string | null
}

export interface EditGameDialogProps {
  game: EditableGame
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** A date column round-trips as YYYY-MM-DD, which is what <input type=date> wants. */
function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : ''
}

export function EditGameDialog({ game, open, onOpenChange }: EditGameDialogProps) {
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [releaseDate, setReleaseDate] = useState('')
  const [acquiredAt, setAcquiredAt] = useState('')
  const [error, setError] = useState<string | null>(null)

  const update = useUpdateGame(game.id)

  // Reload from the record on every open, so a cancelled edit leaves nothing
  // behind and a change made elsewhere is picked up.
  useEffect(() => {
    if (!open) return
    setName(game.name)
    setSummary(game.summary ?? '')
    setReleaseDate(toDateInput(game.releaseDate))
    setAcquiredAt(toDateInput(game.acquiredAt))
    setError(null)
  }, [open, game])

  const trimmedName = name.trim()
  const canSubmit = trimmedName.length > 0 && !update.isPending

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    setError(null)

    // Only what actually changed. The API rejects an empty PATCH rather than
    // treating it as a no-op, and sending untouched fields would clobber a
    // concurrent edit for no reason.
    const body: Record<string, unknown> = {}
    if (trimmedName !== game.name) body.name = trimmedName
    // An emptied field clears the column; the API accepts null for all three.
    if (summary !== (game.summary ?? '')) body.summary = summary.trim() === '' ? null : summary
    if (releaseDate !== toDateInput(game.releaseDate)) {
      body.releaseDate = releaseDate === '' ? null : releaseDate
    }
    if (acquiredAt !== toDateInput(game.acquiredAt)) {
      body.acquiredAt = acquiredAt === '' ? null : acquiredAt
    }

    if (Object.keys(body).length === 0) {
      onOpenChange(false)
      return
    }

    try {
      await update.mutateAsync(body)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save those changes.')
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialog__overlay} />
        <Dialog.Content className={styles.dialog__panel}>
          <div className={styles.dialog__header}>
            <div>
              <Dialog.Title className={styles.dialog__title}>Edit game</Dialog.Title>
              <Dialog.Description className={styles.dialog__description}>
                An IGDB refresh overwrites name, summary and release date — but never what you
                record here about your own copy.
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
              <label className={styles.dialog__label} htmlFor="game-name">
                Name
              </label>
              <input
                id="game-name"
                className={styles.dialog__input}
                value={name}
                autoFocus
                maxLength={100}
                onChange={(event) => {
                  setName(event.target.value)
                }}
              />
            </div>

            <div className={styles.dialog__field}>
              <label className={styles.dialog__label} htmlFor="game-summary">
                Summary
              </label>
              <textarea
                id="game-summary"
                className={styles.dialog__textarea}
                value={summary}
                rows={5}
                maxLength={5000}
                placeholder="What the game is. Usually filled in from IGDB."
                onChange={(event) => {
                  setSummary(event.target.value)
                }}
              />
              <span className={styles.dialog__hint}>
                {summary.length} / 5000 · plain text, not markdown
              </span>
            </div>

            <div className={styles.dialog__row}>
              <div className={styles.dialog__field}>
                <label className={styles.dialog__label} htmlFor="game-release">
                  Release date
                </label>
                <input
                  id="game-release"
                  type="date"
                  className={styles.dialog__input}
                  value={releaseDate}
                  onChange={(event) => {
                    setReleaseDate(event.target.value)
                  }}
                />
              </div>

              <div className={styles.dialog__field}>
                <label className={styles.dialog__label} htmlFor="game-acquired">
                  Acquired
                </label>
                <input
                  id="game-acquired"
                  type="date"
                  className={styles.dialog__input}
                  value={acquiredAt}
                  onChange={(event) => {
                    setAcquiredAt(event.target.value)
                  }}
                />
                <span className={styles.dialog__hint}>When you got your copy</span>
              </div>
            </div>

            <div className={styles.dialog__actions}>
              <Button
                variant="ghost"
                disabled={update.isPending}
                onClick={() => {
                  onOpenChange(false)
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!canSubmit}>
                {update.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
