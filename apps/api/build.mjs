import { build } from 'esbuild'

/**
 * Bundle the API for the production image.
 *
 * Why bundle at all: `@game-library/shared` and `@game-library/db` publish raw
 * TypeScript through their `exports` field, which is ideal in development but
 * means `tsc` alone cannot produce a runnable tree — and shipping `tsx` to
 * production would drag a dev dependency into the runtime.
 *
 * What must be bundled and what must not is the whole trick here:
 *
 *  - `@game-library/*` MUST be inlined. `pnpm deploy` copies them into
 *    node_modules as raw TypeScript, and Node refuses to strip types inside
 *    node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING).
 *  - Everything else MUST stay external, so native modules like sharp and
 *    libraries that resolve files at runtime (pino transports, drizzle) keep
 *    working.
 *
 * `packages: 'external'` cannot express that split — it externalises every
 * bare specifier, workspace packages included — so the plugin below does it.
 */
const externaliseThirdParty = {
  name: 'external-except-workspace',
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === 'entry-point') return null
      // Relative and absolute paths are our own source: bundle them.
      if (args.path.startsWith('.') || args.path.startsWith('/')) return null
      // Our workspace packages: fall through to normal resolution so their
      // TypeScript is compiled into this bundle.
      if (args.path.startsWith('@game-library/')) return null
      // Node built-ins and third-party packages: leave them alone.
      return { path: args.path, external: true }
    })
  },
}
const shared = {
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  plugins: [externaliseThirdParty],
  sourcemap: true,
  logLevel: 'info',
  // Node cannot `require` an ESM bundle; some deps still expect these globals.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      "import { dirname as __dirname_ } from 'node:path';",
      'const require = __createRequire(import.meta.url);',
      'const __filename = __fileURLToPath(import.meta.url);',
      'const __dirname = __dirname_(__filename);',
    ].join('\n'),
  },
}

await Promise.all([
  build({ ...shared, entryPoints: ['src/index.ts'], outfile: 'dist/index.js' }),
  // The one-shot migration runner ships in the same image, run with a
  // different command by the `migrate` compose service.
  build({ ...shared, entryPoints: ['src/migrate.ts'], outfile: 'dist/migrate.js' }),
])
