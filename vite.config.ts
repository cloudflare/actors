import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [cloudflare()],
  build: {
    target: 'esnext',
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: './packages/index.ts',
        core: './packages/core/index.ts',
      },
      output: {
        format: 'es',
        entryFileNames: '[name]/index.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      }
    }
  },
  resolve: {
    extensions: ['.ts', '.js']
  }
}); 