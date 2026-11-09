// Facts the type checker cannot see: the manifest, the static files and the build entry
// names must agree with each other and with the code.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { CONFIG } from '../src/content/config.ts';
import {
  BLOCKED_PAGE_PATH,
  NOTICE_SIGNALS,
  PANIC_COMMAND,
  SCORED_SIGNALS,
  SIGNAL_LABELS,
} from '../src/shared/protocol.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

interface Manifest {
  minimum_chrome_version: string;
  background: { service_worker: string; type?: string };
  permissions: string[];
  commands: Record<string, { suggested_key: { default: string } }>;
  content_scripts: Array<{
    js: string[];
    run_at: string;
    match_origin_as_fallback: boolean;
    all_frames: boolean;
    world?: string;
  }>;
  web_accessible_resources?: unknown;
  externally_connectable?: unknown;
}
const manifest = JSON.parse(
  readFileSync(path.join(PUBLIC_DIR, 'manifest.json'), 'utf8'),
) as Manifest;
const buildScript = readFileSync(path.join(ROOT, 'scripts', 'build.ts'), 'utf8');

const scriptEntry = (file: string): Manifest['content_scripts'][number] | undefined =>
  manifest.content_scripts.find((entry) => entry.js.includes(file));

test('every signal has exactly one sentence on the notice page', () => {
  assert.deepEqual(
    Object.keys(SIGNAL_LABELS).sort(),
    [...SCORED_SIGNALS, ...NOTICE_SIGNALS].sort(),
  );
});

test('every scored signal has a weight', () => {
  assert.deepEqual(Object.keys(CONFIG.WEIGHTS).sort(), [...SCORED_SIGNALS].sort());
});

test('strong traps are scored signals', () => {
  for (const id of CONFIG.STRONG_TRAPS) {
    assert.ok(SCORED_SIGNALS.includes(id), `${id} is not scored`);
  }
});

test('the manifest loads the bundles that the build produces', () => {
  assert.deepEqual(scriptEntry('content.js')?.js, ['content.js']);
  assert.deepEqual(scriptEntry('shield.js')?.js, ['shield.js']);
  assert.equal(manifest.background.service_worker, 'background.js');
  // Bundles are classic scripts, so the worker must not be declared as a module.
  assert.equal(manifest.background.type, undefined);
  for (const entry of ['shield:', 'content:', 'background:', "'blocked/blocked':"]) {
    assert.ok(buildScript.includes(entry), `build.ts has no ${entry} entry`);
  }
});

test('both scripts run early, in top frames only, and reach blob: documents', () => {
  for (const entry of manifest.content_scripts) {
    assert.equal(entry.run_at, 'document_start');
    assert.equal(entry.match_origin_as_fallback, true);
    assert.equal(entry.all_frames, false);
  }
});

test('only the shield runs in the page world', () => {
  assert.equal(scriptEntry('shield.js')?.world, 'MAIN');
  assert.equal(scriptEntry('content.js')?.world, undefined);
});

test('the shortcut command has the name the worker listens for', () => {
  assert.deepEqual(Object.keys(manifest.commands), [PANIC_COMMAND]);
});

// A new permission changes what users are asked to accept, so it must be a deliberate edit.
test('the permission list is exactly the one the design needs', () => {
  const expected = ['downloads', 'history', 'scripting', 'storage', 'tabs', 'webNavigation'];
  assert.deepEqual([...manifest.permissions].sort(), expected);
});

// 134 is the first version that lets the worker inject into blob: tabs that were already open.
test('the minimum Chrome version is 134 and the build targets the same version', () => {
  assert.equal(manifest.minimum_chrome_version, '134');
  assert.ok(buildScript.includes("target: 'chrome134'"), 'build.ts targets another version');
});

test('the manifest exposes nothing to web pages', () => {
  assert.equal(manifest.web_accessible_resources, undefined);
  assert.equal(manifest.externally_connectable, undefined);
});

test('the blocked page exists and loads its script and stylesheet', () => {
  const page = path.join(PUBLIC_DIR, BLOCKED_PAGE_PATH);
  assert.ok(existsSync(page));
  const html = readFileSync(page, 'utf8');
  assert.ok(html.includes('src="blocked.js"'));
  assert.ok(html.includes('href="blocked.css"'));
});
