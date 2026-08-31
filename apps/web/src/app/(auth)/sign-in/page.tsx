import { redirect } from 'next/navigation'

import { getSession } from '@/lib/session'

import { AuthCard } from '../AuthCard'

export const metadata = { title: 'Sign in · Game Library' }

export default async function SignInPage() {
  // Already signed in? Skip the form entirely rather than flashing it.
  if (await getSession()) redirect('/library')
  return <AuthCard mode="sign-in" />
}
