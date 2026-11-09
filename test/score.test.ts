import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decide, deceptionSignals } from '../src/content/score.ts';
import { normalise, type PageText } from '../src/content/text.ts';

const LOCK_SCREEN = normalise(`Windows Security Alert
  Your computer has been locked. Unusual activity has been detected on this device.
  Do not restart or shut down your computer.
  Call Microsoft Support immediately: 1-800-555-0199   Error Code: 0x800704cf`);

const REPORT = normalise(`Monthly Report  Generated on: Mon Nov 09 2026
  Item Value Sessions 1,204 Conversions 87`);

const ALL_WORDING = ['threatPhrase', 'phoneCallToAction', 'brand', 'errorCode'];
const SAMPLE_TRAPS = ['keysBlocked', 'unloadBlocked', 'contextMenuBlocked'];

const page = (text: string): PageText => ({ text, hasTelLink: false });

test('the sample lock screen yields every wording signal', () => {
  assert.deepEqual(deceptionSignals(page(LOCK_SCREEN)).sort(), [...ALL_WORDING].sort());
});

test('the sample report yields no wording signal', () => {
  assert.deepEqual(deceptionSignals(page(REPORT)), []);
});

test('a phone number counts only next to a call to action', () => {
  const invoice = normalise('Invoice 4155550123 was paid on time. Thank you.');
  const footer = normalise('Questions? Call us on (415) 555-0123.');
  assert.equal(deceptionSignals(page(invoice)).includes('phoneCallToAction'), false);
  assert.equal(deceptionSignals(page(footer)).includes('phoneCallToAction'), true);
});

test('a tel: link counts as a call to action by itself', () => {
  assert.deepEqual(deceptionSignals({ text: 'reach the team', hasTelLink: true }), [
    'phoneCallToAction',
  ]);
});

test('wording is the smallest part of the score', () => {
  assert.equal(decide(ALL_WORDING).score, 35);
});

test('wording, layout and context never block without a trap', () => {
  const verdict = decide([...ALL_WORDING, 'alertLayout', 'unfamiliarSite', 'recentBlock']);
  assert.equal(verdict.score, 90);
  assert.equal(verdict.blocked, false);
});

test('soft traps plus hostile text do not block, even on a new site (content-injection abuse)', () => {
  const softTraps = ['unloadBlocked', 'contextMenuBlocked', 'alertLayout'];
  const verdict = decide([...ALL_WORDING, ...softTraps, 'unfamiliarSite']);
  assert.equal(verdict.score, 110);
  assert.equal(verdict.hasStrongTrap, false);
  assert.equal(verdict.blocked, false);
});

test('the provided sample blocks on its traps and wording alone', () => {
  const verdict = decide([...SAMPLE_TRAPS, ...deceptionSignals(page(LOCK_SCREEN))]);
  assert.equal(verdict.score, 100);
  assert.equal(verdict.blocked, true);
});

test('a scam with no readable text blocks on a site never visited, not on a familiar one', () => {
  const imageOnly = [...SAMPLE_TRAPS, 'alertLayout'];
  assert.equal(decide(imageOnly).blocked, false);
  assert.equal(decide([...imageOnly, 'unfamiliarSite']).blocked, true);
});

test('one trap is enough for a lock screen on a site never visited', () => {
  const wording = ['threatPhrase', 'phoneCallToAction', 'brand'];
  const verdict = decide([...wording, 'lockHeld', 'alertLayout', 'unfamiliarSite']);
  assert.equal(verdict.score, 100);
  assert.equal(verdict.blocked, true);
});

test('a request for full screen counts like a held lock', () => {
  const verdict = decide(['lockHeld', 'unloadBlocked', 'contextMenuBlocked', ...ALL_WORDING]);
  assert.equal(verdict.blocked, true);
});

test('unknown and repeated signal ids do not change the score', () => {
  const verdict = decide(['keysBlocked', 'keysBlocked', 'notASignal', '__proto__', 'manual']);
  assert.deepEqual(verdict.signals, ['keysBlocked']);
  assert.equal(verdict.score, 30);
});
