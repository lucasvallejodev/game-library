import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import type { ReactNode } from 'react'

import { ConfirmProvider } from '@/components/ui/confirm-dialog/ConfirmDialog'
import { QueryProvider } from '@/lib/query-client'

import '@/styles/globals.scss'

/**
 * Self-hosted by next/font: no request to Google at runtime, and no layout
 * shift while the face loads. See docs/frontend-guidelines.md §10.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Game Library',
  description: 'Track the games you own across every platform, and never buy one twice.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <QueryProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
