import { nodeConfig } from '@game-library/config/eslint/node'

/**
 * Root ESLint config. Each workspace package inherits this; a package with
 * different needs (apps/web, once Next.js lands in increment 10) adds its own
 * eslint.config.js that composes the shared base.
 */
export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/coverage/**', 'docs/**'],
  },
  ...nodeConfig,
]
