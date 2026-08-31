import type { FastifyInstance } from 'fastify'

/**
 * A signed-in user for tests, with a helper that carries its session cookie.
 *
 * Cross-tenant tests need two of these, so creating them is deliberately cheap.
 */
export interface TestUser {
  email: string
  id: string
  cookie: string
  request: (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: unknown,
  ) => Promise<{ statusCode: number; json: <T = unknown>() => T; body: string }>
}

let counter = 0

export async function createTestUser(app: FastifyInstance, prefix = 'user'): Promise<TestUser> {
  counter += 1
  const email = `${prefix}-${String(counter)}-${String(Date.now())}@example.com`

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email, password: 'correct-horse-battery', name: 'Test User' },
  })

  if (res.statusCode !== 200) {
    throw new Error(`sign-up failed (${String(res.statusCode)}): ${res.body}`)
  }

  const raw = res.headers['set-cookie']
  const cookies = raw ? (Array.isArray(raw) ? raw : [raw]) : []
  const cookie = cookies.map((c) => c.split(';')[0]).join('; ')

  const id = res.json<{ user: { id: string } }>().user.id

  return {
    email,
    id,
    cookie,
    request: async (method, url, payload) => {
      const response = await app.inject({
        method,
        url,
        headers: { cookie },
        ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
      })
      return {
        statusCode: response.statusCode,
        json: <T>() => response.json<T>(),
        body: response.body,
      }
    },
  }
}
