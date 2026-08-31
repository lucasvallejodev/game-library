import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// Versions of the stack are pinned in pnpm-workspace.yaml; the DB URL comes
// from the repo-root .env (see .env.example).
config({ path: '../../.env', quiet: true })

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env first.')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: { url },
  // Readable SQL is the point of choosing Drizzle — generated migrations are
  // committed artifacts we review, not black boxes. See docs/adr.md ADR-001.
  verbose: true,
  strict: true,
})
