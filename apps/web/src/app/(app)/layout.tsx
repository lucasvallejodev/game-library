import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { AppShell } from '@/components/layout/app-shell/AppShell'
import { apiFetch } from '@/lib/api-client'
import { forwardedCookie, getSession } from '@/lib/session'

/**
 * Everything under this layout requires a session.
 *
 * Checked server-side, so an anonymous visitor never receives the shell markup
 * at all — rather than rendering it and hiding it with client-side JavaScript.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/sign-in')

  const cookie = await forwardedCookie()

  // The sidebar count comes from the same request that renders the page, so
  // first paint arrives populated. perPage=1 because only meta.total is used.
  let gameCount = 0
  try {
    const { meta } = await apiFetch<{ meta: { total: number } }>('/api/games?perPage=1', { cookie })
    gameCount = meta.total
  } catch {
    // A count is decoration; failing to fetch it must not take down the shell.
  }

  return (
    <AppShell user={session.user} gameCount={gameCount}>
      {children}
    </AppShell>
  )
}
