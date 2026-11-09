// Limits on what the extension may do by itself, checked against the source. Each one closes
// a way for a web page to turn Lock Guard against its user.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const SRC = path.resolve(import.meta.dirname, '..', 'src');

function sources(folder: string): Array<{ file: string; text: string }> {
  const directory = path.join(SRC, folder);
  return readdirSync(directory)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => ({ file, text: readFileSync(path.join(directory, file), 'utf8') }));
}

function filesMatching(folder: string, pattern: RegExp): string[] {
  return sources(folder)
    .filter(({ text }) => pattern.test(text))
    .map(({ file }) => file);
}

test('the service worker never cancels, deletes or erases a download', () => {
  assert.deepEqual(filesMatching('background', /downloads\s*\.\s*(?:cancel|removeFile|erase)/), []);
});

// The notice page deletes a file only from the click handler of its own button.
test("a file is deleted only by the notice page, on the user's click", () => {
  assert.deepEqual(filesMatching('blocked', /downloads\s*\.\s*removeFile/), ['blocked.ts']);
  assert.deepEqual(filesMatching('content', /chrome\s*\.\s*downloads/), []);
  assert.deepEqual(filesMatching('shield', /chrome\s*\./), []);
});

// Page-world events can be forged, so only the detector's verdict may start the alert period.
test('the alert period is started in one place: when the detector closes a scam page', () => {
  assert.deepEqual(filesMatching('background', /startAlert\(\)/), ['alert.ts', 'rescue.ts']);
});

test('the download rule never reads the alert period', () => {
  const [downloads] = sources('background').filter(({ file }) => file === 'downloads.ts');
  assert.ok(downloads);
  assert.doesNotMatch(downloads.text, /isAlertActive|alert\.ts/);
});

// Watching is allowed on guarded pages; refusing a lock or capping history is not.
test('the shield does not refuse full screen or locks, and leaves history alone', () => {
  assert.deepEqual(filesMatching('shield', /pushState|replaceState|Promise\.reject/), []);
});
