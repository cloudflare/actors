import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'core/index': 'packages/core/src/index.ts',
    'storage/index': 'packages/storage/src/index.ts',
    'alarms/index': 'packages/alarms/src/index.ts',
    'sockets/index': 'packages/sockets/src/index.ts',
  },
  outDir: 'dist',
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  fixedExtension: false,
  external: ['cloudflare:workers', 'cron-schedule', 'nanoid'],
})
