import globals from 'globals'
import tseslint from 'typescript-eslint'

import { baseConfig } from './base.js'

/**
 * Config for Node-side packages (the API, the db package, shared).
 * Adds the Node global environment on top of the shared base.
 */
export const nodeConfig = tseslint.config(...baseConfig, {
  name: 'game-library/node',
  languageOptions: {
    globals: {
      ...globals.node,
    },
  },
})

export default nodeConfig
