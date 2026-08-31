import { schema } from '@game-library/db'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_GAME_TYPES, DEFAULT_GENRES, seedUserDefaults } from '../src/auth/seed-defaults.js'
import { startTestServer, type TestServer } from './helpers/test-server.js'

let s: TestServer

beforeAll(async () => {
  s = await startTestServer({ migrate: true })

  // Routes must be registered before the first request, because readying the
  // instance freezes the route table.
  s.app.get('/test-protected', { preHandler: s.app.requireAuth }, () => ({ ok: true }))
  s.app.get('/test-whoami', { preHandler: s.app.requireAuth }, (request) => ({
    email: request.user?.email,
    hasSession: request.session !== null,
  }))
  await s.app.ready()
}, 240_000)

afterAll(async () => {
  await s.stop()
})

let counter = 0
function uniqueEmail(prefix: string): string {
  counter += 1
  return `${prefix}-${String(counter)}-${String(Date.now())}@example.com`
}

interface SignUpResult {
  status: number
  cookies: string[]
  body: unknown
}

async function signUp(email: string, password = 'correct-horse-battery'): Promise<SignUpResult> {
  const res = await s.app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email, password, name: 'Test User' },
  })
  return {
    status: res.statusCode,
    cookies: res.headers['set-cookie']
      ? Array.isArray(res.headers['set-cookie'])
        ? res.headers['set-cookie']
        : [res.headers['set-cookie']]
      : [],
    body: res.statusCode === 200 ? res.json() : res.body,
  }
}

function cookieHeader(cookies: string[]): string {
  return cookies.map((c) => c.split(';')[0]).join('; ')
}

async function userIdFor(email: string): Promise<string> {
  const rows = await s.app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
  const id = rows[0]?.id
  if (!id) throw new Error(`no user row for ${email}`)
  return id
}

describe('sign up', () => {
  it('creates an account and returns a session cookie', async () => {
    const email = uniqueEmail('signup')
    const result = await signUp(email)

    expect(result.status).toBe(200)
    expect(result.cookies.length).toBeGreaterThan(0)
    expect(cookieHeader(result.cookies)).toContain('game-library')
  })

  it('seeds the account with default game types and genres', async () => {
    const email = uniqueEmail('seed')
    await signUp(email)
    const userId = await userIdFor(email)

    const [types, genres] = await Promise.all([
      s.app.db.select().from(schema.gameTypes).where(eq(schema.gameTypes.userId, userId)),
      s.app.db.select().from(schema.genres).where(eq(schema.genres.userId, userId)),
    ])

    expect(types).toHaveLength(DEFAULT_GAME_TYPES.length)
    expect(genres).toHaveLength(DEFAULT_GENRES.length)
    expect(types.map((t) => t.name).sort()).toEqual([...DEFAULT_GAME_TYPES].sort())
    expect(genres.map((g) => g.name)).toContain('RPG')
    // Seeded rows are flagged so the UI can mark them and re-seeding is safe.
    expect(types.every((t) => t.isDefault)).toBe(true)
  })

  it('seeds no Locations — those are personal, so the UI prompts instead', async () => {
    const email = uniqueEmail('noloc')
    await signUp(email)
    const userId = await userIdFor(email)

    const locations = await s.app.db
      .select()
      .from(schema.locations)
      .where(eq(schema.locations.userId, userId))

    expect(locations).toHaveLength(0)
  })

  it('scopes seeded rows to the account that was created', async () => {
    const a = uniqueEmail('scope-a')
    const b = uniqueEmail('scope-b')
    await signUp(a)
    await signUp(b)

    const [idA, idB] = await Promise.all([userIdFor(a), userIdFor(b)])

    const aTypes = await s.app.db
      .select()
      .from(schema.gameTypes)
      .where(eq(schema.gameTypes.userId, idA))

    expect(aTypes).toHaveLength(DEFAULT_GAME_TYPES.length)
    expect(aTypes.every((t) => t.userId === idA)).toBe(true)
    expect(aTypes.some((t) => t.userId === idB)).toBe(false)
  })

  it('rejects a password shorter than the 12-character minimum', async () => {
    const result = await signUp(uniqueEmail('shortpw'), 'short')
    expect(result.status).toBeGreaterThanOrEqual(400)
  })

  it('rejects a duplicate email', async () => {
    const email = uniqueEmail('dupe')
    expect((await signUp(email)).status).toBe(200)
    expect((await signUp(email)).status).toBeGreaterThanOrEqual(400)
  })
})

describe('seedUserDefaults', () => {
  it('is idempotent — the recovery path depends on it', async () => {
    const email = uniqueEmail('idempotent')
    await signUp(email)
    const userId = await userIdFor(email)

    // Already seeded by the signup hook, so a second call must insert nothing
    // rather than violating UNIQUE (user_id, slug).
    const second = await seedUserDefaults(s.app.db, userId)
    expect(second).toEqual({ gameTypes: 0, genres: 0 })

    const third = await seedUserDefaults(s.app.db, userId)
    expect(third).toEqual({ gameTypes: 0, genres: 0 })

    const types = await s.app.db
      .select()
      .from(schema.gameTypes)
      .where(eq(schema.gameTypes.userId, userId))
    expect(types).toHaveLength(DEFAULT_GAME_TYPES.length)
  })

  it('heals an account whose defaults were partially lost', async () => {
    const email = uniqueEmail('heal')
    await signUp(email)
    const userId = await userIdFor(email)

    // Simulate the failure mode: the hook died partway through.
    await s.app.db
      .delete(schema.gameTypes)
      .where(and(eq(schema.gameTypes.userId, userId), eq(schema.gameTypes.slug, 'emulated')))

    const healed = await seedUserDefaults(s.app.db, userId)
    expect(healed.gameTypes).toBe(1)
    expect(healed.genres).toBe(0)

    const types = await s.app.db
      .select()
      .from(schema.gameTypes)
      .where(eq(schema.gameTypes.userId, userId))
    expect(types).toHaveLength(DEFAULT_GAME_TYPES.length)
  })
})

describe('sign in and sign out', () => {
  it('signs in with the right password and rejects the wrong one', async () => {
    const email = uniqueEmail('signin')
    const password = 'correct-horse-battery'
    await signUp(email, password)

    const good = await s.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email, password },
    })
    expect(good.statusCode).toBe(200)
    expect(good.headers['set-cookie']).toBeDefined()

    const bad = await s.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email, password: 'definitely-not-it' },
    })
    expect(bad.statusCode).toBeGreaterThanOrEqual(400)
  })

  it('returns the session for a signed-in cookie and null without one', async () => {
    const email = uniqueEmail('session')
    const { cookies } = await signUp(email)

    const withCookie = await s.app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: cookieHeader(cookies) },
    })
    expect(withCookie.statusCode).toBe(200)
    expect(withCookie.json<{ user: { email: string } }>().user.email).toBe(email)

    const anonymous = await s.app.inject({ method: 'GET', url: '/api/auth/get-session' })
    expect(anonymous.json()).toBeNull()
  })

  it('revokes the session immediately on sign-out', async () => {
    const email = uniqueEmail('signout')
    const { cookies } = await signUp(email)
    const cookie = cookieHeader(cookies)
    const userId = await userIdFor(email)

    const before = await s.app.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId))
    expect(before).toHaveLength(1)

    const out = await s.app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { cookie },
    })
    expect(out.statusCode).toBe(200)

    // The whole point of DB-backed sessions over JWTs: the *same* cookie is
    // dead straight away, not merely expired at some future time (ADR-003).
    const after = await s.app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie },
    })
    expect(after.json()).toBeNull()

    // Revocation is a real DELETE, not just cookie clearing — that is the
    // whole reason for DB-backed sessions over stateless JWTs (ADR-003).
    const remaining = await s.app.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId))
    expect(remaining).toHaveLength(0)
  })

  it('treats an expired session as anonymous', async () => {
    const email = uniqueEmail('expired')
    const { cookies } = await signUp(email)
    const cookie = cookieHeader(cookies)
    const userId = await userIdFor(email)

    // Backdate the stored session rather than waiting 30 days.
    await s.app.db
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.sessions.userId, userId))

    const after = await s.app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie },
    })
    expect(after.json()).toBeNull()
  })

  it('treats a tampered session cookie as anonymous', async () => {
    const email = uniqueEmail('tampered')
    const { cookies } = await signUp(email)
    const tampered = cookieHeader(cookies).replace(/.$/, 'X')

    const res = await s.app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: tampered },
    })
    expect(res.json()).toBeNull()
  })
})

describe('requireAuth', () => {
  it('rejects anonymous requests with the documented 401 envelope', async () => {
    const res = await s.app.inject({ method: 'GET', url: '/test-protected' })

    expect(res.statusCode).toBe(401)
    expect(res.json()).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
    })
  })

  it('allows a signed-in request and exposes request.user', async () => {
    const email = uniqueEmail('protected')
    const { cookies } = await signUp(email)

    const res = await s.app.inject({
      method: 'GET',
      url: '/test-whoami',
      headers: { cookie: cookieHeader(cookies) },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ email, hasSession: true })
  })
})

describe('session cookie attributes', () => {
  it('sets httpOnly and sameSite=lax', async () => {
    const { cookies } = await signUp(uniqueEmail('cookieattrs'))
    const sessionCookie = cookies.find((c) => c.includes('session'))

    expect(sessionCookie).toBeDefined()
    expect(sessionCookie?.toLowerCase()).toContain('httponly')
    expect(sessionCookie?.toLowerCase()).toContain('samesite=lax')
    expect(sessionCookie?.toLowerCase()).toContain('path=/')
  })
})
