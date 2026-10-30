import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const rootDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(rootDir, 'apps/extension');
const outDir = resolve(rootDir, 'dist-extension');

function copyExtensionAssets() {
  return {
    name: 'copy-extension-assets',
    closeBundle() {
      mkdirSync(outDir, { recursive: true });
      cpSync(join(rootDir, 'extension/manifest.json'), join(outDir, 'manifest.json'));
      cpSync(join(rootDir, 'extension/background.js'), join(outDir, 'background.js'));
      for (const name of ['favicon.png', 'favicon.ico']) {
        const src = join(appRoot, name);
        if (existsSync(src)) cpSync(src, join(outDir, name));
      }
      const iconsSrc = join(rootDir, 'extension/icons');
      if (existsSync(iconsSrc)) cpSync(iconsSrc, join(outDir, 'icons'), { recursive: true });
    },
  };
}

export default defineConfig({
  root: appRoot,
  base: './',
  define: {
    'import.meta.env.VITE_EXTENSION': JSON.stringify('true'),
  },
  resolve: {
    alias: {
      '@simplechat/core': resolve(rootDir, 'packages/core/src/index.ts'),
      '@simplechat/element': resolve(rootDir, 'packages/element/src/index.ts'),
    },
  },
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: false,
  },
  plugins: [copyExtensionAssets()],
});
