'use client'

import type { Location } from '@game-library/shared/schemas'
import { HardDrive, ImagePlus, Pencil, Trash2 } from 'lucide-react'
import { useRef, type CSSProperties } from 'react'

import { mediaUrl } from '@/lib/api-client'

import styles from './LocationCard.module.scss'

export interface LocationCardProps {
  location: Location
  onEdit: (location: Location) => void
  onDelete: (location: Location) => void
  onUploadLogo: (location: Location, file: File) => void
  busy?: boolean
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

export function LocationCard({
  location,
  onEdit,
  onDelete,
  onUploadLogo,
  busy,
}: LocationCardProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const logo = mediaUrl(location.logoUrl)

  return (
    <article
      className={styles.card}
      // The colour is user-chosen hex from the database, so it can only reach
      // CSS as a custom property. See styles/_theme.scss.
      style={{ '--location-color': location.color } as CSSProperties}
    >
      <div className={styles.card__badge}>
        {logo ? (
          // Served by our own API behind an ownership check.
          <img className={styles.card__logo} src={logo} alt="" />
        ) : (
          <span aria-hidden="true">{initials(location.name)}</span>
        )}
      </div>

      <div className={styles.card__body}>
        <div className={styles.card__name}>{location.name}</div>
        <div className={styles.card__meta}>
          <span>
            {location.gameCount} {location.gameCount === 1 ? 'game' : 'games'}
          </span>
          <span className={styles.card__hex}>{location.color}</span>
        </div>
      </div>

      <div className={styles.card__actions}>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onUploadLogo(location, file)
            // Reset so choosing the same file twice still fires a change.
            event.target.value = ''
          }}
        />

        <button
          type="button"
          className={styles['card__icon-button']}
          disabled={busy}
          aria-label={`Upload a logo for ${location.name}`}
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus aria-hidden="true" />
        </button>

        <button
          type="button"
          className={styles['card__icon-button']}
          disabled={busy}
          aria-label={`Edit ${location.name}`}
          onClick={() => {
            onEdit(location)
          }}
        >
          <Pencil aria-hidden="true" />
        </button>

        <button
          type="button"
          className={`${styles['card__icon-button']} ${styles['card__icon-button--danger']}`}
          disabled={busy}
          aria-label={`Delete ${location.name}`}
          onClick={() => {
            onDelete(location)
          }}
        >
          <Trash2 aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}

export { HardDrive }
