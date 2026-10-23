import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC (instead of esbuild) so Nest decorators emit the metadata DI needs.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api',
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    name: 'api',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,test}/**/*.{test,spec,e2e-spec}.ts'],
    globalSetup: ['test/global-setup.ts'],
    // e2e suites share one database: run files one after another.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/api',
      provider: 'v8' as const,
    },
  },
}));
