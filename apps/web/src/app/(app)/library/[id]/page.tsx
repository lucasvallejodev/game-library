import type { GameDetail } from '@game-library/shared/schemas'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ApiError, apiFetch } from '@/lib/api-client'
import { forwardedCookie } from '@/lib/session'

import { GameDetailView } from './GameDetailView'

interface PageProps {
  // Async request APIs: params is a promise in this version of Next.
  params: Promise<{ id: string }>
}

async function loadGame(id: string): Promise<GameDetail | null> {
  try {
    return await apiFetch<GameDetail>(`/api/games/${id}`, { cookie: await forwardedCookie() })
  } catch (error) {
    // 404 is a real "no such game"; anything else is an outage, and rendering
    // "not found" for it would be a lie. A 403 cannot leak another user's game
    // either — the API scopes every read by userId.
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) return null
    throw error
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const game = await loadGame(id)
  return { title: game ? `${game.name} · Game Library` : 'Game · Game Library' }
}

export default async function GamePage({ params }: PageProps) {
  const { id } = await params
  const game = await loadGame(id)
  if (!game) notFound()

  return <GameDetailView initialData={game} />
}
