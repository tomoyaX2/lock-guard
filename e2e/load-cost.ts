// Measures what the extension adds to loading an ordinary page: no extension, the content
// script alone, and both scripts. Usage: npm run measure [-- rounds loads]

import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';

import { EXTENSION_DIR, startServer } from './harness.ts';

const [rounds = 5, loads = 80] = process.argv.slice(2).map(Number);
const WARM_UP = 8;

/** A copy of the build without the page-world shield, to price the shield on its own. */
function buildWithoutShield(): string {
  const dir = path.join(mkdtempSync(path.join(os.tmpdir(), 'lockguard-perf-')), 'dist');
  cpSync(EXTENSION_DIR, dir, { recursive: true });
  const file = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
    content_scripts: { js: string[] }[];
  };
  manifest.content_scripts = manifest.content_scripts.filter(
    (entry) => !entry.js.includes('shield.js'),
  );
  writeFileSync(file, JSON.stringify(manifest));
  return dir;
}

/** Median load time, start of navigation to the end of the load event, after a warm-up. */
async function medianLoad(base: string, extension: string | null): Promise<number> {
  const enableExtensions = extension ? [extension] : true;
  const browser = await puppeteer.launch({ headless: true, pipe: true, enableExtensions });
  const times: number[] = [];
  try {
    const page = await browser.newPage();
    for (let i = 0; i < loads + WARM_UP; i += 1) {
      await page.goto(`${base}/benign.html?${i}`, { waitUntil: 'load' });
      const time = await page.evaluate(() => {
        const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
        return entry ? entry.loadEventEnd - entry.startTime : NaN;
      });
      if (i >= WARM_UP) {
        times.push(time);
      }
    }
  } finally {
    await browser.close();
  }
  return times.sort((a, b) => a - b)[Math.floor(times.length / 2)] ?? NaN;
}

const server = await startServer();
const variants: [string, string | null][] = [
  ['no extension', null],
  ['content script only', buildWithoutShield()],
  ['both scripts', EXTENSION_DIR],
];
const totals = new Map<string, number[]>(variants.map(([name]) => [name, []]));
for (let round = 1; round <= rounds; round += 1) {
  const line: string[] = [];
  for (const [name, dir] of variants) {
    const median = await medianLoad(server.base, dir);
    totals.get(name)?.push(median);
    line.push(`${name} ${median.toFixed(1)} ms`);
  }
  process.stdout.write(`round ${round}: ${line.join(' | ')}\n`);
}
for (const [name, list] of totals) {
  const mean = list.reduce((sum, value) => sum + value, 0) / list.length;
  process.stdout.write(`${name}: mean of medians ${mean.toFixed(2)} ms\n`);
}
server.close();
