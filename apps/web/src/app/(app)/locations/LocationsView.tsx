'use client'

import type { Location } from '@game-library/shared/schemas'
import { HardDrive, Plus } from 'lucide-react'
import { useState } from 'react'

import { LocationCard } from '@/components/location/location-card/LocationCard'
import { LocationDialog } from '@/components/location/location-dialog/LocationDialog'
import { EmptyState } from '@/components/layout/empty-state/EmptyState'
import { Topbar } from '@/components/layout/topbar/Topbar'
import { Button } from '@/components/ui/button/Button'
import { useConfirm } from '@/components/ui/confirm-dialog/ConfirmDialog'
import {
  useDeleteLocation,
  useLocations,
  useUploadLocationLogo,
} from '@/features/locations/queries'
import { ApiError } from '@/lib/api-client'

import styles from '@/components/location/location-card/LocationCard.module.scss'

export interface LocationsViewProps {
  initialData: Location[]
}

export function LocationsView({ initialData }: LocationsViewProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Location | null>(null)
  const [error, setError] = useState<string | null>(null)

  const locations = useLocations(initialData)
  const remove = useDeleteLocation()
  const uploadLogo = useUploadLocationLogo()
  const confirm = useConfirm()

  const busy = remove.isPending || uploadLogo.isPending
  const data = locations.data ?? initialData

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(location: Location) {
    setEditing(location)
    setDialogOpen(true)
  }

  async function handleDelete(location: Location) {
    // Deleting a location does not delete its games — say so, because the
    // opposite is what people fear.
    const ok = await confirm({
      title: `Delete “${location.name}”?`,
      description:
        location.gameCount > 0
          ? `Its ${String(location.gameCount)} ${
              location.gameCount === 1 ? 'game stays' : 'games stay'
            } in your library, just no longer filed here.`
          : 'Nothing is filed here, so nothing else changes.',
      confirmLabel: 'Delete location',
    })
    if (!ok) return

    setError(null)
    remove.mutate(location.id, {
      onError: (err) => {
        setError(err instanceof ApiError ? err.message : `Could not delete “${location.name}”.`)
      },
    })
  }

  function handleUploadLogo(location: Location, file: File) {
    setError(null)
    uploadLogo.mutate(
      { id: location.id, file },
      {
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Could not upload that image.')
        },
      },
    )
  }

  return (
    <>
      <Topbar title="Locations" onAdd={openCreate} />

      {error && (
        <p role="alert" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}

      {data.length === 0 ? (
        <EmptyState
          icon={HardDrive}
          title="No locations yet"
          description="Locations are where your games live — GOG, Steam, a console, an external drive. Nothing is seeded for you because these are personal."
          action={
            <Button variant="primary" onClick={openCreate}>
              <Plus aria-hidden="true" />
              Add your first location
            </Button>
          }
        />
      ) : (
        <div className={styles.list}>
          {data.map((location) => (
            <LocationCard
              key={location.id}
              location={location}
              busy={busy}
              onEdit={openEdit}
              onDelete={(location) => void handleDelete(location)}
              onUploadLogo={handleUploadLogo}
            />
          ))}
        </div>
      )}

      <LocationDialog open={dialogOpen} onOpenChange={setDialogOpen} location={editing} />
    </>
  )
}
