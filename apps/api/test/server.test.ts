import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { startTestServer, type TestServer } from './helpers/test-server.js'

let s: TestServer

beforeAll(async () => {
  s = await startTestServer()
}, 240_000)

afterAll(async () => {
  await s.stop()
})

describe('health', () => {
  it('reports liveness without touching dependencies', async () => {
    const res = await s.app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ status: 'ok' })
    expect(res.json<{ uptimeSeconds: number }>().uptimeSeconds).toBeGreaterThanOrEqual(0)
  })

  it('reports readiness with both dependencies up', async () => {
    const res = await s.app.inject({ method: 'GET', url: '/health/ready' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      status: 'ok',
      dependencies: { database: true, redis: true },
    })
  })

  it('returns 503 and names the failing dependency when Redis is down', async () => {
    // Disconnect the live client rather than mocking the probe, so this
    // exercises the real failure path.
    s.app.redis.disconnect()

    const res = await s.app.inject({ method: 'GET', url: '/health/ready' })

    expect(res.statusCode).toBe(503)
    expect(res.json()).toMatchObject({
      status: 'degraded',
      dependencies: { database: true, redis: false },
    })

    await s.app.redis.connect()
    const recovered = await s.app.inject({ method: 'GET', url: '/health/ready' })
    expect(recovered.statusCode).toBe(200)
  })
})

describe('errors', () => {
  it('returns the documented envelope for an unknown route', async () => {
    const res = await s.app.inject({ method: 'GET', url: '/does-not-exist' })

    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route GET /does-not-exist not found' },
    })
  })
})

describe('security headers and CORS', () => {
  it('sets helmet headers', async () => {
    const res = await s.app.inject({ method: 'GET', url: '/health' })

    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'")
  })

  it('allows the configured web origin with credentials', async () => {
    const res = await s.app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'GET' },
    })

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000')
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  it('does not reflect an unknown origin', async () => {
    const res = await s.app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example' },
    })

    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('openapi', () => {
  it('generates a spec from the route schemas', () => {
    const spec = s.app.swagger()

    expect(spec.info.title).toBe('Game Library API')
    expect(spec.paths?.['/health']).toBeDefined()
    expect(spec.paths?.['/health/ready']).toBeDefined()
  })

  it('serves the docs UI', async () => {
    const res = await s.app.inject({ method: 'GET', url: '/api/docs/' })
    expect(res.statusCode).toBe(200)
  })
})

describe('logging redaction', () => {
  it('replaces secrets with [redacted] instead of printing them', async () => {
    const { pino } = await import('pino')
    const { REDACT_PATHS } = await import('../src/server.js')

    const lines: string[] = []
    const logger = pino(
      { redact: { paths: REDACT_PATHS, censor: '[redacted]' } },
      { write: (chunk: string) => lines.push(chunk) },
    )

    logger.info({
      req: { headers: { authorization: 'Bearer super-secret', cookie: 'session=abc' } },
      password: 'hunter2',
      client_secret: 'twitch-secret',
      access_token: 'igdb-token',
      safe: 'this should survive',
    })

    const output = lines.join('')
    for (const secret of [
      'super-secret',
      'session=abc',
      'hunter2',
      'twitch-secret',
      'igdb-token',
    ]) {
      expect(output, `${secret} leaked into the logs`).not.toContain(secret)
    }
    expect(output).toContain('[redacted]')
    expect(output).toContain('this should survive')
  })
})
