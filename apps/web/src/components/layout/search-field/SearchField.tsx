'use client'

import { Search } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import styles from './SearchField.module.scss'

/**
 * The sidebar search from the reference.
 *
 * Filter state lives in the URL, not component state: that makes a filtered
 * view shareable, survivable across a refresh, and correct with the browser's
 * back button — all for free. See docs/frontend-guidelines.md §7.
 */
export function SearchField() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const urlQuery = searchParams.get('q') ?? ''
  const [value, setValue] = useState(urlQuery)

  // Keep in step when the URL changes from elsewhere (back button, a cleared
  // filter chip) without fighting the user mid-keystroke.
  useEffect(() => {
    setValue(urlQuery)
  }, [urlQuery])

  useEffect(() => {
    if (value === urlQuery) return

    // Debounced so a search does not fire a request per keystroke.
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) params.set('q', value)
      else params.delete('q')
      // A new search always returns to page 1; staying on page 4 of the old
      // result set would look like an empty library.
      params.delete('page')

      const target = pathname === '/' ? '/library' : pathname
      router.replace(`${target}?${params.toString()}`)
    }, 300)

    return () => {
      clearTimeout(timer)
    }
  }, [value, urlQuery, pathname, router, searchParams])

  return (
    <div className={styles.search}>
      <Search className={styles.search__icon} aria-hidden="true" />
      <input
        type="search"
        className={styles.search__input}
        placeholder="Search"
        aria-label="Search your library"
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
        }}
      />
    </div>
  )
}
