import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: false,
  },
  resolve: {
    alias: {
      '@simplechat/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
});
