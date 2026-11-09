// Builds the loadable extension into dist/: copies public/ (manifest, HTML, CSS) and bundles
// each entry point into one plain script, since Chrome runs neither TypeScript nor imports here.

import { build } from 'esbuild';
import { cp, rm } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');

// Output name (without .js) → source entry. The names must match public/manifest.json.
const ENTRY_POINTS = {
  shield: 'src/shield/index.ts',
  content: 'src/content/index.ts',
  background: 'src/background/index.ts',
  'blocked/blocked': 'src/blocked/blocked.ts',
};

await rm(DIST, { recursive: true, force: true });
await cp(path.join(ROOT, 'public'), DIST, { recursive: true });
await build({
  absWorkingDir: ROOT,
  entryPoints: ENTRY_POINTS,
  outdir: DIST,
  bundle: true,
  format: 'iife',
  // Keep in step with minimum_chrome_version in public/manifest.json; a test checks it.
  target: 'chrome134',
  legalComments: 'none',
  logLevel: 'warning',
});
process.stdout.write(`Built ${path.relative(ROOT, DIST)}${path.sep}\n`);
