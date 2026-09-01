'use client'

import * as Dialog from '@radix-ui/react-dialog'
import type { IgdbGame } from '@game-library/shared/schemas'
import clsx from 'clsx'
import { Check, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button/Button'
import { useCreateGame, useIgdbSearch } from '@/features/library/queries'
import { ApiError } from '@/lib/api-client'

import styles from './AddGameDialog.module.scss'

export interface AddGameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function useDebounced(value: string, delay = 350): string {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value)
    }, delay)
    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debounced
}

/**
 * Search IGDB and add a game.
 *
 * Each result is annotated by the API with whether you already own it, so a
 * duplicate is visible *before* you can add it — the reason this project
 * exists. Owned titles are shown and disabled rather than hidden: knowing you
 * have it is the answer you came for.
 */
export function AddGameDialog({ open, onOpenChange }: AddGameDialogProps) {
  const [term, setTerm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const debounced = useDebounced(term)

  const search = useIgdbSearch(debounced)
  const createGame = useCreateGame()

  // Start clean each time the dialog opens.
  useEffect(() => {
    if (open) {
      setTerm('')
      setError(null)
    }
  }, [open])

  async function add(game: IgdbGame) {
    setError(null)
    try {
      await createGame.mutateAsync({ igdbId: game.igdbId, name: game.name })
      onOpenChange(false)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not add that game. Is the API still running?',
      )
    }
  }

  async function addManually() {
    const name = term.trim()
    if (!name) return

    setError(null)
    try {
      await createGame.mutateAsync({ name })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add that game.')
    }
  }

  const results = search.data?.data ?? []
  const tooShort = debounced.trim().length < 2

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialog__overlay} />
        <Dialog.Content className={styles.dialog__panel}>
          <div className={styles.dialog__header}>
            <div>
              <Dialog.Title className={styles.dialog__title}>Add a game</Dialog.Title>
              <Dialog.Description className={styles.dialog__description}>
                Search IGDB for cover art and metadata, or add a title by hand.
              </Dialog.Description>
            </div>
            <Dialog.Close className={styles.dialog__close} aria-label="Close">
              <X aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className={styles.dialog__search}>
            <input
              className={styles.dialog__input}
              placeholder="Search IGDB…"
              aria-label="Search IGDB"
              value={term}
              autoFocus
              onChange={(event) => {
                setTerm(event.target.value)
              }}
            />
          </div>

          {error && (
            <div className={styles.dialog__error} role="alert">
              {error}
            </div>
          )}

          <div className={styles.dialog__results}>
            {tooShort ? (
              <p className={styles.dialog__status}>Type at least two characters to search.</p>
            ) : search.isPending ? (
              <p className={styles.dialog__status}>Searching IGDB…</p>
            ) : search.isError ? (
              <p className={styles.dialog__status}>
                IGDB is unavailable. You can still add “{term.trim()}” by hand below.
              </p>
            ) : results.length === 0 ? (
              <p className={styles.dialog__status}>No matches on IGDB.</p>
            ) : (
              results.map((game) => (
                <button
                  key={game.igdbId}
                  type="button"
                  className={styles.result}
                  disabled={game.inLibrary || createGame.isPending}
                  onClick={() => {
                    void add(game)
                  }}
                >
                  {game.coverUrl ? (
                    // An IGDB preview URL; the real cover is mirrored into
                    // our own storage when the game is saved.
                    <img className={styles.result__cover} src={game.coverUrl} alt="" />
                  ) : (
                    <span className={styles.result__cover} aria-hidden="true" />
                  )}

                  <span className={styles.result__body}>
                    <span className={styles.result__name}>{game.name}</span>
                    <span className={styles.result__meta}>
                      {[game.releaseDate?.slice(0, 4), game.genres.slice(0, 2).join(', ')]
                        .filter(Boolean)
                        .join(' · ') || 'No metadata'}
                    </span>
                  </span>

                  {game.inLibrary && (
                    <span className={styles.result__owned}>
                      <Check aria-hidden="true" />
                      In library
                    </span>
                  )}
                  {!game.inLibrary && game.inWishlist && (
                    <span className={clsx(styles.result__owned, styles.result__wishlisted)}>
                      Wishlisted
                    </span>
                  )}
                </button>
              ))
            )}
          </div>

          <div className={styles.dialog__footer}>
            <span className={styles.dialog__hint}>
              {createGame.isPending ? 'Adding…' : 'Covers are copied into your own storage.'}
            </span>
            <Button
              variant="secondary"
              disabled={term.trim().length === 0 || createGame.isPending}
              onClick={() => {
                void addManually()
              }}
            >
              <Plus aria-hidden="true" />
              Add “{term.trim() || '…'}” manually
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
