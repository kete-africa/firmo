import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    // The catalogs compile for tests too: chat messages come from them (constitution).
    paraglideVitePlugin({
      project: fileURLToPath(new URL('./project.inlang', import.meta.url)),
      outdir: fileURLToPath(new URL('./src/paraglide', import.meta.url)),
      outputStructure: 'message-modules',
      cookieName: 'kete_locale',
      strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Integration tests share the Neon "test" branch: one file at a time.
    fileParallelism: false,
  },
});
