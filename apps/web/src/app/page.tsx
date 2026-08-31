import { redirect } from 'next/navigation'

import { getSession } from '@/lib/session'

/**
 * The root is a router, not a page: signed in goes to the library, anonymous
 * goes to sign-in. Doing this on the server avoids a visible redirect flash.
 */
export default async function RootPage() {
  redirect((await getSession()) ? '/library' : '/sign-in')
}
