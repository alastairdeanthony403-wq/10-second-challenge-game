import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: { target: 'es2020', sourcemap: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
