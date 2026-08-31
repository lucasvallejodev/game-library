'use client'

import { Gamepad2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button/Button'
import { signIn, signUp } from '@/lib/auth-client'

import styles from './AuthLayout.module.scss'

export type AuthMode = 'sign-in' | 'sign-up'

const MIN_PASSWORD_LENGTH = 12

/**
 * Better Auth requires a name. If the field is left blank, derive something
 * usable rather than rejecting the form over a cosmetic field.
 * Written out longhand because `??` would keep an empty string.
 */
function resolveName(name: string, email: string): string {
  const trimmed = name.trim()
  if (trimmed.length > 0) return trimmed

  const localPart = email.split('@')[0]?.trim()
  return localPart && localPart.length > 0 ? localPart : 'Player'
}

interface AuthResult {
  error?: { message?: string } | null
}

/**
 * Sign-in and sign-up share one card: the fields and failure modes are almost
 * identical, and keeping them together stops the two drifting apart visually.
 */
export function AuthCard({ mode }: { mode: AuthMode }) {
  const router = useRouter()
  const isSignUp = mode === 'sign-up'

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const tooShort = isSignUp && password.length > 0 && password.length < MIN_PASSWORD_LENGTH

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (tooShort) {
      setError(`Password must be at least ${String(MIN_PASSWORD_LENGTH)} characters.`)
      return
    }

    setPending(true)
    try {
      const result: AuthResult = isSignUp
        ? await signUp.email({ name: resolveName(name, email), email, password })
        : await signIn.email({ email, password })

      if (result.error) {
        // Deliberately generic on sign-in: a message distinguishing "no such
        // account" from "wrong password" is an account-enumeration oracle.
        setError(
          result.error.message ??
            (isSignUp ? 'Could not create that account.' : 'Email or password is incorrect.'),
        )
        return
      }

      router.replace('/library')
      router.refresh()
    } catch {
      setError('Could not reach the server. Is the API running?')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={styles.auth}>
      <div className={styles.auth__card}>
        <div className={styles.auth__brand}>
          <Gamepad2 aria-hidden="true" />
          <span className={styles['auth__brand-name']}>Game Library</span>
        </div>

        <h1 className={styles.auth__title}>{isSignUp ? 'Create your library' : 'Welcome back'}</h1>
        <p className={styles.auth__subtitle}>
          {isSignUp
            ? 'Track what you own across every platform, and never buy the same game twice.'
            : 'Sign in to see your library.'}
        </p>

        <form className={styles.auth__form} onSubmit={(e) => void handleSubmit(e)} noValidate>
          {error && (
            <div className={styles.auth__error} role="alert">
              {error}
            </div>
          )}

          {isSignUp && (
            <div className={styles.auth__field}>
              <label className={styles.auth__label} htmlFor="name">
                Name
              </label>
              <input
                id="name"
                name="name"
                className={styles.auth__input}
                autoComplete="name"
                placeholder="Your name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                }}
              />
            </div>
          )}

          <div className={styles.auth__field}>
            <label className={styles.auth__label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className={styles.auth__input}
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
              }}
            />
          </div>

          <div className={styles.auth__field}>
            <label className={styles.auth__label} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className={styles.auth__input}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              placeholder="••••••••••••"
              aria-invalid={tooShort}
              aria-describedby={isSignUp ? 'password-hint' : undefined}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
              }}
            />
            {isSignUp && (
              <span className={styles.auth__hint} id="password-hint">
                At least {MIN_PASSWORD_LENGTH} characters. Length beats punctuation.
              </span>
            )}
          </div>

          <Button type="submit" variant="primary" block disabled={pending}>
            {pending ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        <div className={styles.auth__divider}>or</div>

        <Button
          variant="secondary"
          block
          disabled={pending}
          onClick={() => {
            setPending(true)
            void signIn.social({ provider: 'google', callbackURL: '/library' }).catch(() => {
              setError('Google sign-in is not configured on this server.')
              setPending(false)
            })
          }}
        >
          Continue with Google
        </Button>

        <p className={styles.auth__footer}>
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <Link className={styles.auth__link} href={isSignUp ? '/sign-in' : '/sign-up'}>
            {isSignUp ? 'Sign in' : 'Create one'}
          </Link>
        </p>
      </div>
    </div>
  )
}
