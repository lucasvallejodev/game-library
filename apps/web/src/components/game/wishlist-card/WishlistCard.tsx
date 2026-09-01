'use client'

import type { WishlistItem } from '@game-library/shared/schemas'
import clsx from 'clsx'
import { ExternalLink, Gamepad2, ShoppingCart, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button/Button'
import { Markdown } from '@/components/ui/markdown/Markdown'
import { mediaUrl } from '@/lib/api-client'

import styles from './WishlistCard.module.scss'

export interface WishlistCardProps {
  item: WishlistItem
  onPromote: (item: WishlistItem) => void
  onRemove: (item: WishlistItem) => void
  busy?: boolean
}

function formatPrice(amount: string | null, currency: string | null): string | null {
  if (!amount) return null
  // The API sends a string so the value never passes through a float. Format
  // it, but keep the original text as the source of truth.
  const numeric = Number(amount)
  if (Number.isNaN(numeric)) return amount

  try {
    return new Intl.NumberFormat(undefined, {
      style: currency ? 'currency' : 'decimal',
      ...(currency ? { currency } : {}),
    }).format(numeric)
  } catch {
    // An unknown currency code should show the price, not throw.
    return currency ? `${amount} ${currency}` : amount
  }
}

/**
 * A wanted game. Listed rather than gridded: priority, target price and notes
 * are the things you scan here, and they do not fit under a cover.
 */
export function WishlistCard({ item, onPromote, onRemove, busy }: WishlistCardProps) {
  const cover = mediaUrl(item.thumbUrl ?? item.coverUrl)
  const price = formatPrice(item.targetPrice, item.currency)
  const year = item.releaseDate?.slice(0, 4)

  return (
    <article className={styles.item}>
      <div className={styles.item__cover}>
        {cover ? (
          // Served by our own API behind an ownership check.
          <img className={styles.item__image} src={cover} alt="" loading="lazy" />
        ) : (
          <Gamepad2 size={20} aria-hidden="true" />
        )}
      </div>

      <div className={styles.item__body}>
        <div className={styles.item__header}>
          <h3 className={styles.item__name}>{item.name}</h3>

          <div className={styles.item__actions}>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                onPromote(item)
              }}
              title="Move this into your library"
            >
              <ShoppingCart aria-hidden="true" />I bought it
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              aria-label={`Remove ${item.name} from wishlist`}
              onClick={() => {
                onRemove(item)
              }}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className={styles.item__meta}>
          <span className={clsx(styles.priority, styles[`priority--${item.priority}`])}>
            {item.priority}
          </span>
          {price && <span className={styles.item__price}>Target {price}</span>}
          {year && <span>{year}</span>}
          {item.genres.length > 0 && <span>{item.genres.map((g) => g.name).join(', ')}</span>}
          {item.storeUrl && (
            <a
              className={styles.item__store}
              href={item.storeUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Store <ExternalLink aria-hidden="true" />
            </a>
          )}
        </div>

        {item.notes && (
          <div className={styles.item__notes}>
            <Markdown>{item.notes}</Markdown>
          </div>
        )}
      </div>
    </article>
  )
}
