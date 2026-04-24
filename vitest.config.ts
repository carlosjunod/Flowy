import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    environment: 'node',
    environmentMatchGlobs: [['tests/unit/**/*.test.tsx', 'jsdom']],
    setupFiles: ['./tests/setup.ts'],
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'apps/web/app/api/**/*.ts',
        'worker/src/**/*.ts',
      ],
      exclude: ['**/*.test.ts', '**/node_modules/**'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'apps/web'),
      '@worker': resolve(__dirname, 'worker/src'),
      pocketbase: resolve(__dirname, 'apps/web/node_modules/pocketbase/dist/pocketbase.es.mjs'),
    },
  },
  esbuild: {
    jsx: 'automatic',
  },
});
