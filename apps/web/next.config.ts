import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { NextConfig } from 'next'

const here = dirname(fileURLToPath(import.meta.url))

const config: NextConfig = {
  reactStrictMode: true,

  // Workspace packages ship TypeScript source rather than build output, so
  // Next has to compile them alongside the app.
  transpilePackages: ['@game-library/shared'],

  sassOptions: {
    // Lets every module write `@use '@/styles/tokens'` instead of counting
    // ../../.. to the styles directory. Note that files inside src/styles must
    // still use explicit './name' for their own siblings: once a stylesheet is
    // loaded through the alias importer, a bare relative name no longer
    // resolves.
    loadPaths: [resolve(here, 'src')],
    includePaths: [resolve(here, 'src')],
  },

  // Note: Next 16 removed the `eslint` config key. Linting is a workspace
  // concern anyway, run by `pnpm lint` with our own flat config.
}

export default config
