'use client'

import clsx from 'clsx'
import {
  Gamepad2,
  HardDrive,
  Heart,
  LayoutGrid,
  Settings,
  Tags,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { SignOutButton } from '@/components/auth/SignOutButton'
import { SearchField } from '@/components/layout/search-field/SearchField'
import type { SessionUser } from '@/lib/session'

import styles from './Sidebar.module.scss'

interface NavLink {
  href: string
  label: string
  icon: LucideIcon
}

/**
 * Grouped navigation under uppercase muted labels, as in the reference.
 * Only routes we actually build appear — the reference's Store, Community and
 * Friends are not requirements (ADR-013).
 */
const NAV_GROUPS: { label: string; links: NavLink[] }[] = [
  {
    label: 'Library',
    links: [
      { href: '/library', label: 'Games', icon: LayoutGrid },
      { href: '/wishlist', label: 'Wishlist', icon: Heart },
      { href: '/locations', label: 'Locations', icon: HardDrive },
    ],
  },
  {
    label: 'Manage',
    links: [
      { href: '/game-types', label: 'Game Types', icon: Gamepad2 },
      { href: '/genres', label: 'Genres', icon: Tags },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

export interface SidebarContentProps {
  user: SessionUser
  gameCount: number
  /** Called after a nav link is followed, so the mobile drawer can close. */
  onNavigate?: () => void
}

/**
 * The sidebar's contents, shared by the fixed desktop rail and the mobile
 * drawer. Written once so the two can never drift apart.
 */
export function SidebarContent({ user, gameCount, onNavigate }: SidebarContentProps) {
  const pathname = usePathname()

  return (
    <>
      <div className={styles.sidebar__profile}>
        {user.image ? (
          // A plain <img>, not next/image: a 40px remote avatar is not worth
          // the remotePatterns config, and it is decorative (alt="").
          <img className={styles.sidebar__avatar} src={user.image} alt="" />
        ) : (
          <div className={styles['sidebar__avatar-fallback']} aria-hidden="true">
            {initials(user.name)}
          </div>
        )}
        <div className={styles.sidebar__identity}>
          <div className={styles.sidebar__name}>{user.name}</div>
          <div className={styles.sidebar__meta}>
            {gameCount} {gameCount === 1 ? 'game' : 'games'}
          </div>
        </div>
      </div>

      <SearchField />

      <div className={styles.sidebar__nav}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className={styles.sidebar__group}>
            <div className={styles['sidebar__group-label']}>{group.label}</div>
            {group.links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`)
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  className={clsx(styles['nav-item'], active && styles['nav-item--active'])}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className={styles['nav-item__icon']} aria-hidden="true" />
                  <span className={styles['nav-item__label']}>{label}</span>
                  {href === '/library' && gameCount > 0 && (
                    <span className={styles['nav-item__count']}>{gameCount}</span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </div>

      <div className={styles.sidebar__footer}>
        <SignOutButton />
      </div>
    </>
  )
}
