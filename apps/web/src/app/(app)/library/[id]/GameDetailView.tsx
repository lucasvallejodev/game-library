'use client'

import type { GameDetail } from '@game-library/shared/schemas'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Gamepad2,
  HardDrive,
  ImagePlus,
  Loader2,
  Pencil,
  RefreshCw,
  Star,
  Tags,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, type CSSProperties } from 'react'

import {
  GameTypeItems,
  GenreItems,
  LocationItems,
} from '@/components/game/game-taxonomy/GameTaxonomyItems'
import { LocationChip } from '@/components/game/location-chip/LocationChip'
import { Button } from '@/components/ui/button/Button'
import { Markdown } from '@/components/ui/markdown/Markdown'
import {
  useDeleteGame,
  useGame,
  useRefreshIgdb,
  useUpdateGame,
  useUploadCover,
} from '@/features/library/queries'
import { mediaUrl } from '@/lib/api-client'

import menuStyles from '@/components/ui/dropdown-menu/DropdownMenu.module.scss'
import styles from './GameDetailView.module.scss'

export interface GameDetailViewProps {
  initialData: GameDetail
}

/** A full date, spelled out — the store-page convention. */
function formatDate(value: string | null): string | null {
  if (!value) return null
  // Date-only strings are parsed as UTC; forcing the timezone back stops a
  // release sliding to the previous day west of Greenwich.
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: value.length === 10 ? 'UTC' : undefined,
  })
}

/**
 * The game page, laid out like a store listing: a hero banner carrying the
 * cover and headline facts, a wide column for the description, and a side
 * column for everything about *your* copy.
 *
 * There is no price box and no buy button — the equivalent slot holds where
 * the game lives, which is the question this app exists to answer.
 */
export function GameDetailView({ initialData }: GameDetailViewProps) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)

  const [error, setError] = useState<string | null>(null)
  const [editingNotes, setEditingNotes] = useState(false)
  const [draft, setDraft] = useState('')

  const query = useGame(initialData.id, initialData)
  const game = query.data ?? initialData

  const update = useUpdateGame(game.id)
  const refresh = useRefreshIgdb(game.id)
  const uploadCover = useUploadCover(game.id)
  const remove = useDeleteGame()

  const cover = mediaUrl(game.coverUrl ?? game.thumbUrl)
  const releaseDate = formatDate(game.releaseDate)
  const acquiredAt = formatDate(game.acquiredAt)
  const addedAt = formatDate(game.createdAt)
  const updatedAt = formatDate(game.updatedAt)
  const year = game.releaseDate?.slice(0, 4)

  // IGDB scores 0–100. Shown as-is rather than rescaled to five stars, so it
  // stays recognisably the number IGDB reports.
  const rating = game.igdbRating === null ? null : Math.round(game.igdbRating)

  const busy = update.isPending || refresh.isPending || uploadCover.isPending || remove.isPending

  function handleRefresh() {
    setError(null)
    refresh.mutate(undefined, {
      onError: (err) => {
        setError(err instanceof Error ? err.message : 'Could not refresh from IGDB.')
      },
    })
  }

  function handleCover(file: File) {
    setError(null)
    uploadCover.mutate(file, {
      onError: (err) => {
        setError(err instanceof Error ? err.message : 'Could not upload that image.')
      },
    })
  }

  function handleDelete() {
    if (
      !window.confirm(
        `Remove “${game.name}” from your library? This does not affect anything you own elsewhere.`,
      )
    ) {
      return
    }

    setError(null)
    remove.mutate(game.id, {
      onSuccess: () => {
        router.push('/library')
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : 'Could not remove that game.')
      },
    })
  }

  function startEditingNotes() {
    setDraft(game.notes ?? '')
    setEditingNotes(true)
  }

  function saveNotes() {
    setError(null)
    // An emptied box clears the field rather than storing "".
    const next = draft.trim() === '' ? null : draft
    update.mutate(
      { notes: next },
      {
        onSuccess: () => {
          setEditingNotes(false)
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Could not save your notes.')
        },
      },
    )
  }

  return (
    <div className={styles.page}>
      <Link href="/library" className={styles.page__back}>
        <ArrowLeft aria-hidden="true" />
        Back to library
      </Link>

      {error && (
        <p className={styles.page__error} role="alert">
          {error}
        </p>
      )}

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <header className={styles.hero}>
        {/* The cover, blown up and blurred, is the backdrop — the store-page
            trick that gives a page art direction without a second asset. */}
        {cover && (
          <div
            className={styles.hero__backdrop}
            style={{ '--backdrop': `url(${cover})` } as CSSProperties}
            aria-hidden="true"
          />
        )}

        <div className={styles.hero__inner}>
          <div className={styles.hero__cover}>
            {cover ? (
              // Served by our own API behind an ownership check.
              <img className={styles.hero__image} src={cover} alt={`${game.name} cover`} />
            ) : (
              <div className={styles.hero__placeholder}>
                <Gamepad2 aria-hidden="true" />
                <span>No cover</span>
              </div>
            )}

            <button
              type="button"
              className={styles.hero__replace}
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              <ImagePlus aria-hidden="true" />
              {cover ? 'Replace cover' : 'Add a cover'}
            </button>

            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/avif"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) handleCover(file)
                // Reset so picking the same file twice still fires a change.
                event.target.value = ''
              }}
            />
          </div>

          <div className={styles.hero__body}>
            <h1 className={styles.hero__title}>{game.name}</h1>

            <div className={styles.hero__facts}>
              {year && <span className={styles.hero__fact}>{year}</span>}
              {game.gameType && <span className={styles.hero__fact}>{game.gameType.name}</span>}
              {rating !== null && (
                <span className={styles.score}>
                  <Star aria-hidden="true" />
                  <strong>{rating}</strong>
                  <span className={styles.score__scale}>/ 100 on IGDB</span>
                </span>
              )}
            </div>

            {game.summary ? (
              <p className={styles.hero__summary}>{game.summary}</p>
            ) : (
              <p className={styles.hero__muted}>
                No summary. IGDB had none, or this was added by hand.
              </p>
            )}

            {game.genres.length > 0 && (
              <div className={styles.tags}>
                {game.genres.map((genre) => (
                  <span key={genre.id} className={styles.tags__tag}>
                    {genre.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className={styles.columns}>
        {/* ── Main column ────────────────────────────────────────────────── */}
        <main className={styles.main}>
          <section className={styles.panel}>
            <div className={styles.panel__header}>
              <h2 className={styles.panel__title}>My notes</h2>
              {!editingNotes && (
                <button
                  type="button"
                  className={styles.panel__action}
                  disabled={busy}
                  onClick={startEditingNotes}
                >
                  <Pencil aria-hidden="true" />
                  {game.notes ? 'Edit' : 'Add notes'}
                </button>
              )}
            </div>

            {editingNotes ? (
              <div className={styles.notes}>
                <textarea
                  className={styles.notes__input}
                  value={draft}
                  rows={12}
                  autoFocus
                  maxLength={50_000}
                  placeholder="Markdown is supported — which edition you own, what the key is for, whether the DLC is worth it…"
                  onChange={(event) => {
                    setDraft(event.target.value)
                  }}
                />
                <div className={styles.notes__actions}>
                  <Button
                    variant="ghost"
                    disabled={update.isPending}
                    onClick={() => {
                      setEditingNotes(false)
                    }}
                  >
                    Cancel
                  </Button>
                  <Button variant="primary" disabled={update.isPending} onClick={saveNotes}>
                    {update.isPending ? 'Saving…' : 'Save notes'}
                  </Button>
                </div>
              </div>
            ) : game.notes ? (
              <Markdown>{game.notes}</Markdown>
            ) : (
              <p className={styles.panel__empty}>
                Nothing yet. Notes are yours alone — an IGDB refresh never touches them.
              </p>
            )}
          </section>

          {/* Every remaining field, so nothing about the record is hidden. */}
          <section className={styles.panel}>
            <h2 className={styles.panel__title}>Details</h2>
            <dl className={styles.facts}>
              <Fact label="Released" value={releaseDate ?? 'Unknown'} />
              <Fact
                label="IGDB rating"
                value={rating === null ? 'Not rated' : `${String(rating)} / 100`}
              />
              <Fact label="Game type" value={game.gameType?.name ?? 'Not set'} />
              <Fact
                label="Genres"
                value={game.genres.length > 0 ? game.genres.map((g) => g.name).join(', ') : 'None'}
              />
              <Fact label="Acquired" value={acquiredAt ?? 'Not recorded'} />
              <Fact label="Added to library" value={addedAt ?? '—'} />
              <Fact label="Last updated" value={updatedAt ?? '—'} />
              <Fact
                label="IGDB ID"
                value={game.igdbId === null ? 'Added by hand' : String(game.igdbId)}
                mono={game.igdbId !== null}
              />
              {/* Postgres derives this; it explains where the game files in an
                  A–Z sort when the title starts with an article. */}
              <Fact label="Files under" value={game.sortName} mono />
            </dl>
          </section>
        </main>

        {/* ── Side column: the store's buy box, repurposed ────────────────── */}
        <aside className={styles.side}>
          <section className={styles.panel}>
            <div className={styles.panel__header}>
              <h2 className={styles.panel__title}>
                <HardDrive aria-hidden="true" />
                Where you have it
              </h2>
              <PickerMenu label="Edit locations" disabled={busy}>
                <LocationItems game={game} onError={setError} />
              </PickerMenu>
            </div>

            {game.locations.length > 0 ? (
              <div className={styles.side__chips}>
                {game.locations.map((location) => (
                  <LocationChip key={location.id} name={location.name} color={location.color} />
                ))}
              </div>
            ) : (
              <p className={styles.panel__empty}>
                Not filed anywhere yet — so the duplicate-purchase check cannot warn you about it.
              </p>
            )}
          </section>

          <section className={styles.panel}>
            <div className={styles.panel__header}>
              <h2 className={styles.panel__title}>
                <Gamepad2 aria-hidden="true" />
                Game type
              </h2>
              <PickerMenu label="Edit game type" disabled={busy}>
                <GameTypeItems game={game} onError={setError} />
              </PickerMenu>
            </div>

            {game.gameType ? (
              <span className={styles.tags__tag}>{game.gameType.name}</span>
            ) : (
              <p className={styles.panel__empty}>No type set.</p>
            )}
          </section>

          <section className={styles.panel}>
            <div className={styles.panel__header}>
              <h2 className={styles.panel__title}>
                <Tags aria-hidden="true" />
                Genres
              </h2>
              <PickerMenu label="Edit genres" disabled={busy}>
                <GenreItems game={game} onError={setError} />
              </PickerMenu>
            </div>

            {game.genres.length > 0 ? (
              <div className={styles.tags}>
                {game.genres.map((genre) => (
                  <span key={genre.id} className={styles.tags__tag}>
                    {genre.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className={styles.panel__empty}>No genres yet.</p>
            )}
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panel__title}>Your copy</h2>
            <dl className={styles.facts}>
              <Fact
                label={<CalendarDays aria-hidden="true" />}
                srLabel="Acquired"
                value={acquiredAt ? `Acquired ${acquiredAt}` : 'Acquisition date not recorded'}
              />
              <Fact
                label={<Clock aria-hidden="true" />}
                srLabel="Added to library"
                value={addedAt ? `Added ${addedAt}` : '—'}
              />
            </dl>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panel__title}>Manage</h2>
            <div className={styles.side__actions}>
              <Button
                block
                disabled={busy || game.igdbId === null}
                title={
                  game.igdbId === null
                    ? 'This game was added by hand, so there is no IGDB record to pull from'
                    : undefined
                }
                onClick={handleRefresh}
              >
                {refresh.isPending ? (
                  <Loader2 className={styles.spin} aria-hidden="true" />
                ) : (
                  <RefreshCw aria-hidden="true" />
                )}
                Refresh from IGDB
              </Button>

              <Button block disabled={busy} onClick={() => fileInput.current?.click()}>
                <ImagePlus aria-hidden="true" />
                {cover ? 'Replace cover' : 'Add a cover'}
              </Button>

              <Button variant="danger" block disabled={busy} onClick={handleDelete}>
                <Trash2 aria-hidden="true" />
                Remove from library
              </Button>
            </div>

            <p className={styles.side__note}>
              Removing a game deletes only this record. Refreshing pulls name, summary, cover,
              release date, rating and genres from IGDB — never your notes, locations or type.
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}

interface PickerMenuProps {
  label: string
  disabled?: boolean
  children: React.ReactNode
}

/**
 * A section-header "Edit" that opens one of the shared taxonomy pickers.
 * Same item lists the grid card uses, mounted under their own trigger here
 * rather than nested as submenus.
 */
function PickerMenu({ label, disabled, children }: PickerMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.panel__action} disabled={disabled} aria-label={label}>
        <Pencil aria-hidden="true" />
        Edit
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={menuStyles.menu}
          sideOffset={4}
          align="end"
          collisionPadding={8}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

interface FactProps {
  label: React.ReactNode
  /** Accessible name when `label` is an icon rather than text. */
  srLabel?: string
  value: string
  mono?: boolean
}

function Fact({ label, srLabel, value, mono }: FactProps) {
  return (
    <div className={styles.facts__row}>
      <dt className={styles.facts__label}>
        {srLabel && <span className={styles['sr-only']}>{srLabel}</span>}
        {label}
      </dt>
      <dd
        className={
          mono ? `${styles.facts__value} ${styles['facts__value--mono']}` : styles.facts__value
        }
      >
        {value}
      </dd>
    </div>
  )
}
