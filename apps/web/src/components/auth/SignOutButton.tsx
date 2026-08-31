'use client'

import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button/Button'
import { signOut } from '@/lib/auth-client'

export function SignOutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  return (
    <Button
      variant="ghost"
      block
      disabled={pending}
      onClick={() => {
        setPending(true)
        void signOut().finally(() => {
          // refresh() re-runs the server components, which drops the cached
          // session and sends the shell back to sign-in.
          router.replace('/sign-in')
          router.refresh()
        })
      }}
    >
      <LogOut aria-hidden="true" />
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  )
}
