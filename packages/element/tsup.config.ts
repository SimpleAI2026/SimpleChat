import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync } from 'node:fs';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  external: ['@simplechat/core', 'marked'],
  async onSuccess() {
    mkdirSync('dist', { recursive: true });
    copyFileSync('src/style.css', 'dist/style.css');
  },
});
