import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const API_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

interface BootResult {
  code: number | null
  stdout: string
  stderr: string
}

/**
 * Run the real entrypoint as a child process with a hostile environment.
 *
 * Spawning rather than calling parseEnv directly is the point: the guarantee
 * we care about is that the *process* refuses to start, with a non-zero exit
 * code a container runtime will notice. A unit test on the parser cannot prove
 * that the entrypoint is actually wired to it.
 */
function boot(env: NodeJS.ProcessEnv, timeoutMs = 30_000): Promise<BootResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('node', ['--import', 'tsx', 'src/index.ts'], {
      cwd: API_ROOT,
      // Empty parent env AND ENV_FILE pointed at nothing, so neither the
      // ambient environment nor the developer's real .env can mask a failure.
      env: {
        PATH: process.env.PATH ?? '',
        SystemRoot: process.env.SystemRoot ?? '',
        ENV_FILE: resolve(API_ROOT, 'no-such-file.env'),
        ...env,
      },
      shell: false,
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString()))
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString()))

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      rejectPromise(new Error(`process did not exit within ${String(timeoutMs)}ms`))
    }, timeoutMs)

    child.on('error', rejectPromise)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolvePromise({ code, stdout, stderr })
    })
  })
}

describe('boot-time environment validation', () => {
  it('exits non-zero with a readable message when config is missing', async () => {
    const result = await boot({ GAME_LIBRARY_TEST_EMPTY_ENV: '1' })

    expect(result.code).toBe(1)

    const output = result.stderr + result.stdout
    expect(output).toContain('Invalid environment configuration')
    // Names the specific variables, not just "validation failed".
    expect(output).toContain('DATABASE_URL')
    expect(output).toContain('REDIS_URL')
    expect(output).toContain('BETTER_AUTH_SECRET')
    // Points at the fix.
    expect(output).toContain('.env.example')
  })

  it('exits non-zero when a single variable is malformed', async () => {
    const result = await boot({
      WEB_ORIGIN: 'http://localhost:3000',
      DATABASE_URL: 'mysql://localhost:3306/db',
      REDIS_URL: 'redis://localhost:6379',
      BETTER_AUTH_SECRET: 'z'.repeat(32),
      BETTER_AUTH_URL: 'http://localhost:4000',
    })

    expect(result.code).toBe(1)
    expect(result.stderr + result.stdout).toMatch(/DATABASE_URL.*Postgres/s)
  })

  it('does not print secret values back out when rejecting config', async () => {
    const result = await boot({
      WEB_ORIGIN: 'not-a-url',
      DATABASE_URL: 'postgresql://user:pw@localhost:5432/db',
      REDIS_URL: 'redis://localhost:6379',
      BETTER_AUTH_SECRET: 'super-secret-value-that-is-long-enough',
      BETTER_AUTH_URL: 'http://localhost:4000',
    })

    expect(result.code).toBe(1)
    const output = result.stderr + result.stdout
    expect(output).toContain('WEB_ORIGIN')
    // A config error must not become a secret disclosure in the logs.
    expect(output).not.toContain('super-secret-value-that-is-long-enough')
  })
})
