import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the production bundle can be served from any static path.
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1400,
  },
  server: {
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    globals: false,
  },
});
