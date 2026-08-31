import { redirect } from 'next/navigation'

import { getSession } from '@/lib/session'

import { AuthCard } from '../AuthCard'

export const metadata = { title: 'Create account · Game Library' }

export default async function SignUpPage() {
  if (await getSession()) redirect('/library')
  return <AuthCard mode="sign-up" />
}
