import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/**/*.test.ts'],
          environment: 'node',
          // Pulling and booting a Postgres container is slow on a cold cache.
          testTimeout: 120_000,
          hookTimeout: 240_000,
          // One container at a time: parallel files would each start their own.
          fileParallelism: false,
        },
      },
    ],
  },
})
