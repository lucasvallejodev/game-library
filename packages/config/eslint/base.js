import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

/**
 * Shared flat-config base for every package in the workspace.
 *
 * Type-aware rules are enabled via `projectService`, which is why the
 * TypeScript version is pinned to the 5.x line — see pnpm-workspace.yaml.
 * The async-safety rules below are the reason that pin exists.
 */
export const baseConfig = tseslint.config(
  {
    name: 'game-library/ignores',
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.next/**',
      '**/*.tsbuildinfo',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    name: 'game-library/language-options',
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
    },
  },

  {
    name: 'game-library/rules',
    rules: {
      // --- Async safety -------------------------------------------------
      // A dropped promise in a Fastify handler or a Drizzle transaction is a
      // silent data bug. These are the rules worth pinning TypeScript for.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',
      // 'in-try-catch', not 'always': Fastify instances and replies are
      // thenable, so 'always' fires on every `return reply.send(...)`. Inside
      // try/catch is where the await genuinely matters for stack traces.
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],

      // --- Type hygiene -------------------------------------------------
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // `any` is a deliberate decision, not an accident. Warn so it shows up
      // in review rather than blocking a legitimate escape hatch.
      '@typescript-eslint/no-explicit-any': 'warn',

      // --- General ------------------------------------------------------
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  {
    // Fastify's typed plugin signatures (FastifyPluginAsync*) require an async
    // function whether or not the body awaits anything.
    name: 'game-library/fastify-plugins',
    files: ['**/*.routes.ts', '**/plugins/**/*.ts'],
    rules: { '@typescript-eslint/require-await': 'off' },
  },

  {
    name: 'game-library/tests',
    files: ['**/*.test.ts', '**/*.test.tsx', '**/test/**', '**/e2e/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
    },
  },

  // Config files are plain JS and not covered by a tsconfig.
  {
    name: 'game-library/config-files',
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },

  // Must stay last: turns off every rule that would fight Prettier.
  prettier,
)

export default baseConfig
