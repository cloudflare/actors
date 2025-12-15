import { defineWorkersProject } from '@cloudflare/vitest-pool-workers/config'
import { sharedConfig } from '../../vitest.shared'

export default defineWorkersProject({
  test: {
    ...sharedConfig.test,
    name: 'storage',
    poolOptions: {
      workers: {
        singleWorker: true,
        wrangler: {
          configPath: './test/test-wrangler.jsonc',
        },
      },
    },
  },
})
