import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'packages/core/vitest.config.ts',
      'packages/storage/vitest.config.ts',
    ],
  },
})
