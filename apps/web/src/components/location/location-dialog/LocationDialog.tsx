'use client'

import * as Dialog from '@radix-ui/react-dialog'
import type { Location } from '@game-library/shared/schemas'
import clsx from 'clsx'
import { X } from 'lucide-react'
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'

import { Button } from '@/components/ui/button/Button'
import { useCreateLocation, useUpdateLocation } from '@/features/locations/queries'
import { ApiError } from '@/lib/api-client'

import styles from './LocationDialog.module.scss'

/**
 * Starting colours, picked to read clearly on the dark surface and to match
 * the platforms people actually file games under.
 */
const PRESETS = [
  { hex: '#7B4FBF', label: 'GOG purple' },
  { hex: '#1B2838', label: 'Steam navy' },
  { hex: '#2F9BFF', label: 'Blue' },
  { hex: '#3FBF7F', label: 'Green' },
  { hex: '#E8A33D', label: 'Amber' },
  { hex: '#E5484D', label: 'Red' },
  { hex: '#E85C9E', label: 'Pink' },
  { hex: '#9AA1AB', label: 'Grey' },
]

const HEX = /^#[0-9a-fA-F]{6}$/

export interface LocationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; omitted when creating. */
  location?: Location | null
}

export function LocationDialog({ open, onOpenChange, location }: LocationDialogProps) {
  const editing = Boolean(location)

  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESETS[0]?.hex ?? '#2F9BFF')
  const [error, setError] = useState<string | null>(null)

  const create = useCreateLocation()
  const update = useUpdateLocation()
  const pending = create.isPending || update.isPending

  // Reset each time the dialog opens, so an edit never leaks into the next
  // create and a cancelled edit does not persist.
  useEffect(() => {
    if (!open) return
    setName(location?.name ?? '')
    setColor(location?.color ?? PRESETS[0]?.hex ?? '#2F9BFF')
    setError(null)
  }, [open, location])

  const colorValid = HEX.test(color)
  const canSubmit = name.trim().length > 0 && colorValid && !pending

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    setError(null)

    try {
      if (location) {
        await update.mutateAsync({ id: location.id, body: { name: name.trim(), color } })
      } else {
        await create.mutateAsync({ name: name.trim(), color })
      }
      onOpenChange(false)
    } catch (err) {
      // A 409 here means the name collides after slugging — the API's message
      // already explains that, so show it rather than a generic failure.
      setError(err instanceof ApiError ? err.message : 'Could not save that location.')
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
                {editing ? 'Edit location' : 'New location'}
              </Dialog.Title>
              <Dialog.Description className={styles.dialog__description}>
                Where a game lives — a store, a console, or a drive on your desk.
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
              <label className={styles.dialog__label} htmlFor="location-name">
                Name
              </label>
              <input
                id="location-name"
                className={styles.dialog__input}
                placeholder="GOG, Steam, WD 4TB External…"
                value={name}
                autoFocus
                maxLength={100}
                onChange={(event) => {
                  setName(event.target.value)
                }}
              />
            </div>

            <div className={styles.dialog__field}>
              <span className={styles.dialog__label}>Colour</span>
              <div className={styles.colour}>
                <div className={styles.colour__swatches}>
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.hex}
                      type="button"
                      aria-label={preset.label}
                      aria-pressed={color.toUpperCase() === preset.hex.toUpperCase()}
                      className={clsx(
                        styles.colour__swatch,
                        color.toUpperCase() === preset.hex.toUpperCase() &&
                          styles['colour__swatch--selected'],
                      )}
                      style={{ '--swatch': preset.hex } as CSSProperties}
                      onClick={() => {
                        setColor(preset.hex)
                      }}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  className={styles.colour__native}
                  aria-label="Custom colour"
                  value={colorValid ? color : '#2F9BFF'}
                  onChange={(event) => {
                    setColor(event.target.value.toUpperCase())
                  }}
                />
              </div>
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
                {pending ? 'Saving…' : editing ? 'Save changes' : 'Create location'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
