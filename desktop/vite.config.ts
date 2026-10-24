import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart(options) {
          options.startup();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              // Native, Node-only, or browser-field packages load from node_modules at runtime
              external: ['better-sqlite3', 'electron', 'ws', 'bufferutil', 'utf-8-validate', '@google/genai', 'pdfjs-dist']
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            // Sandboxed preload scripts must be CommonJS
            lib: {
              entry: 'electron/preload.ts',
              formats: ['cjs'],
              // The plugin's default 'es' format is merged in too; keep its output out of the way
              fileName: (format) => (format === 'cjs' ? 'preload.cjs' : 'preload.mjs')
            },
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      }
    ]),
    renderer()
  ],
  build: {
    rollupOptions: {
      input: {
        overlay: resolve(__dirname, 'overlay.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        'test-nudge': resolve(__dirname, 'test-nudge.html')
      }
    }
  }
});
