import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    alias: {
      'cloudflare:workers': resolve(__dirname, './__mocks__/cloudflare-workers.js')
    }
  }
});
