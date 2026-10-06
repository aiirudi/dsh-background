import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
});
await build({
  entryPoints: ['src/client.ts'],
  outfile: 'dist/client.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  loader: { '.png': 'dataurl' },
});
