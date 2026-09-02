'use client'

import type { LucideIcon } from 'lucide-react'
import { Gamepad2, Plus, Search, Tags } from 'lucide-react'
import { useMemo, useState } from 'react'

import { EmptyState } from '@/components/layout/empty-state/EmptyState'
import { Topbar } from '@/components/layout/topbar/Topbar'
import { TaxonomyRow } from '@/components/taxonomy/taxonomy-row/TaxonomyRow'
import { TaxonomyDialog } from '@/components/taxonomy/taxonomy-dialog/TaxonomyDialog'
import { Button } from '@/components/ui/button/Button'
import {
  useDeleteTaxonomy,
  useTaxonomyList,
  type TaxonomyItem,
  type TaxonomyKind,
  type TaxonomyRecord,
} from '@/features/taxonomy/queries'
import { ApiError } from '@/lib/api-client'

import styles from './TaxonomyView.module.scss'

interface KindConfig {
  title: string
  /** Singular noun used throughout the copy — "game type", "genre". */
  noun: string
  icon: LucideIcon
  placeholder: string
  emptyDescription: string
  /**
   * What actually happens to the games when this row goes. The two kinds
   * differ, and the difference is the thing people are afraid of.
   */
  deleteWarning: (item: TaxonomyItem) => string
}

/** Games survive either kind of delete; only the filing changes. */
function warning(item: TaxonomyItem, consequence: string): string {
  if (item.gameCount === 0) return `Delete “${item.name}”?`
  const plural = item.gameCount === 1 ? 'game stays' : 'games stay'
  return `Delete “${item.name}”? Its ${String(item.gameCount)} ${plural} in your library, ${consequence}.`
}

/**
 * Copy lives here rather than in the pages because icons and functions cannot
 * cross the server/client boundary — a server component may only hand this
 * view serialisable props.
 */
const CONFIG: Record<TaxonomyKind, KindConfig> = {
  'game-types': {
    title: 'Game Types',
    noun: 'game type',
    icon: Gamepad2,
    placeholder: 'Physical, Digital, Subscription…',
    emptyDescription:
      'How you own a game — physical, digital, a subscription, emulated. Four are seeded at signup, and you can add your own.',
    deleteWarning: (item) => warning(item, 'without a type'),
  },
  genres: {
    title: 'Genres',
    noun: 'genre',
    icon: Tags,
    placeholder: 'Roguelike, Metroidvania…',
    emptyDescription:
      'Fourteen genres are seeded at signup, and IGDB imports map onto them automatically. Add your own for anything IGDB does not cover.',
    deleteWarning: (item) => warning(item, 'just no longer tagged with it'),
  },
}

export interface TaxonomyViewProps {
  kind: TaxonomyKind
  initialData: TaxonomyRecord[]
}

/**
 * The management screen shared by Game Types and Genres: list, filter, create,
 * rename, delete. Both are per-user rows with the same shape, so the only
 * differences are the copy in CONFIG.
 */
export function TaxonomyView({ kind, initialData }: TaxonomyViewProps) {
  const { title, noun, icon: Icon, placeholder, emptyDescription, deleteWarning } = CONFIG[kind]

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TaxonomyItem | null>(null)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)

  const list = useTaxonomyList(kind, initialData)
  const remove = useDeleteTaxonomy(kind)

  const data = list.data ?? initialData

  // Sorted by name so the order is stable across renames and reloads; the
  // API's insertion order would shuffle as soon as anything is edited.
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return data
      .filter((item) => item.name.toLowerCase().includes(needle))
      .toSorted((a, b) => a.name.localeCompare(b.name))
  }, [data, filter])

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openRename(item: TaxonomyItem) {
    setEditing(item)
    setDialogOpen(true)
  }

  function handleDelete(item: TaxonomyItem) {
    if (!window.confirm(deleteWarning(item))) return

    setError(null)
    remove.mutate(item.id, {
      onError: (err) => {
        setError(err instanceof ApiError ? err.message : `Could not delete “${item.name}”.`)
      },
    })
  }

  return (
    <>
      <Topbar title={title} onAdd={openCreate} addLabel={`Add a ${noun}`} />

      {error && (
        <p className={styles.taxonomy__error} role="alert">
          {error}
        </p>
      )}

      {data.length === 0 ? (
        <EmptyState
          icon={Icon}
          title={`No ${noun}s yet`}
          description={emptyDescription}
          action={
            <Button variant="primary" onClick={openCreate}>
              <Plus aria-hidden="true" />
              Add your first {noun}
            </Button>
          }
        />
      ) : (
        <div className={styles.taxonomy}>
          {/* Worth having from the start: the seed alone ships fourteen genres. */}
          <div className={styles.taxonomy__filter}>
            <Search className={styles['taxonomy__filter-icon']} aria-hidden="true" />
            <input
              className={styles['taxonomy__filter-input']}
              type="search"
              placeholder={`Filter ${noun}s…`}
              value={filter}
              aria-label={`Filter ${noun}s`}
              onChange={(event) => {
                setFilter(event.target.value)
              }}
            />
            <span className={styles.taxonomy__count}>
              {visible.length} of {data.length}
            </span>
          </div>

          {visible.length === 0 ? (
            <p className={styles.taxonomy__none}>Nothing matches “{filter.trim()}”.</p>
          ) : (
            <div className={styles.taxonomy__list}>
              {visible.map((item) => (
                <TaxonomyRow
                  key={item.id}
                  item={item}
                  busy={remove.isPending}
                  onRename={openRename}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <TaxonomyDialog
        kind={kind}
        noun={noun}
        placeholder={placeholder}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editing}
      />
    </>
  )
}
