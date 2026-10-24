import { defineConfig } from 'vitest/config';

// Tests run in plain Node without the Electron plugins from vite.config.ts.
// better-sqlite3 >= 12 ships Node-API prebuilds, so the same binary loads in Node and Electron.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'electron/**/*.test.ts']
  }
});
