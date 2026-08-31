/**
 * Shared Prettier config. Matches .editorconfig — keep the two in step.
 *
 * @type {import('prettier').Config}
 */
export const prettierConfig = {
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  arrowParens: 'always',
  endOfLine: 'lf',
  overrides: [
    {
      files: ['*.md'],
      options: {
        proseWrap: 'preserve',
      },
    },
    {
      files: ['*.scss'],
      options: {
        singleQuote: false,
      },
    },
  ],
}

export default prettierConfig
