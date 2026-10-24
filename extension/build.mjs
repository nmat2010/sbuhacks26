// Bundles the extension into dist/ (load unpacked from extension/dist).
// The background worker is an ES module; content and popup scripts must be classic scripts.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'fs';

const watch = process.argv.includes('--watch');

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');

const common = { bundle: true, target: 'chrome120', sourcemap: true, logLevel: 'info' };

await Promise.all([
  build({ ...common, entryPoints: ['src/background/index.ts'], format: 'esm', outfile: 'dist/background.js' }),
  build({ ...common, entryPoints: ['src/content/index.ts'], format: 'iife', outfile: 'dist/content.js' }),
  build({ ...common, entryPoints: ['src/popup/index.ts'], format: 'iife', outfile: 'dist/popup.js' })
]);

cpSync('manifest.json', 'dist/manifest.json');
cpSync('popup.html', 'dist/popup.html');
cpSync('icons', 'dist/icons', { recursive: true });

if (watch) console.log('Watch mode is not implemented; rerun npm run build.');
