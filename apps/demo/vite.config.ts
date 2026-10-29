import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === 'simple-chat',
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@simplechat/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@simplechat/element': path.resolve(__dirname, '../../packages/element/src/index.ts'),
      '@simplechat/vue': path.resolve(__dirname, '../../packages/vue/src/index.ts'),
    },
  },
  server: {
    port: 5173,
  },
});
