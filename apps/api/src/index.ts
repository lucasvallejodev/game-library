import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import closeWithGrace from 'close-with-grace'
import { config } from 'dotenv'

import { loadEnv } from './env.js'
import { buildServer } from './server.js'

/**
 * Load the repo-root .env before anything reads process.env.
 *
 * Local convenience only — in Docker the environment is passed directly and no
 * .env exists. ENV_FILE overrides the path (point it at a nonexistent file to
 * opt out entirely), which is also what lets boot tests assert on a genuinely
 * empty environment rather than silently picking up the developer's .env.
 */
const envFile =
  process.env.ENV_FILE ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env')
config({ path: envFile, quiet: true })

// Exits with a readable message if anything is missing or malformed.
const env = loadEnv()

const app = await buildServer(env)

// Drain in-flight requests, then close Postgres and Redis, before exiting.
closeWithGrace({ delay: 10_000 }, async ({ err }) => {
  if (err) {
    app.log.error({ err }, 'shutting down after fatal error')
  }
  await app.close()
})

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT })
} catch (error) {
  app.log.fatal({ err: error }, 'failed to start')
  process.exit(1)
}
