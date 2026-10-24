import { defineConfig } from 'vitest/config';

// Content-script tests run in jsdom (no layout: use textContent, inject visibility checks).
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts']
  }
});
