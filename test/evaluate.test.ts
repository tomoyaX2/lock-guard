// Pins down evaluate.ts: harmless pages are never probed, probing stops once the verdict is
// settled, probes are budgeted, and only probe hits are remembered. Each test is a new page.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CONFIG } from '../src/content/config.ts';
import { createEvaluator } from '../src/content/evaluate.ts';
import type { Check } from '../src/content/probes.ts';
import type { Verdict } from '../src/content/score.ts';
import type { ScoredSignal } from '../src/shared/protocol.ts';

const INTRUSIVE: readonly ScoredSignal[] = ['keysBlocked', 'contextMenuBlocked', 'unloadBlocked'];
const PASSIVE_FIRST: readonly ScoredSignal[] = [
  'lockHeld',
  'historyStuffed',
  'dialogFlood',
  'unfamiliarSite',
  'recentBlock',
];
const ORDER: readonly ScoredSignal[] = [...PASSIVE_FIRST, 'alertLayout', ...INTRUSIVE];
// With nothing found, the last passive check is skipped too: a block is already out of reach.
const HARMLESS_PAGE_CALLS = PASSIVE_FIRST.slice(0, 4);
const LOOKS_LIKE_ALERT: readonly ScoredSignal[] = ['unfamiliarSite', 'alertLayout'];
const REPORT_TEXT = 'monthly report sessions 1,204 conversions 87';
const LOCK_SCREEN_TEXT =
  'your computer has been locked call microsoft support 1-800-555-0199 error 0x800704cf';

interface Page {
  /** Evaluates the page with this text while these checks hit; returns the verdict and calls. */
  run: (text: string, hitIds?: readonly ScoredSignal[]) => Verdict & { calls: ScoredSignal[] };
}

function newPage(): Page {
  let text = '';
  let hits = new Set<ScoredSignal>();
  let calls: ScoredSignal[] = [];
  const checks: Check[] = ORDER.map((id) => ({
    id,
    intrusive: INTRUSIVE.includes(id),
    run: () => {
      calls.push(id);
      return hits.has(id);
    },
  }));
  const evaluate = createEvaluator({ collect: () => ({ text, hasTelLink: false }), checks });
  return {
    run(pageText, hitIds = []) {
      text = pageText;
      hits = new Set(hitIds);
      calls = [];
      return { ...evaluate(), calls };
    },
  };
}

test('a page with no scam wording and no locks is read passively and never probed', () => {
  const { calls, blocked } = newPage().run(REPORT_TEXT);
  assert.deepEqual(calls, HARMLESS_PAGE_CALLS);
  assert.equal(blocked, false);
});

test('a vendor name alone does not cause probing either', () => {
  assert.deepEqual(newPage().run('a note that mentions windows').calls, HARMLESS_PAGE_CALLS);
});

test('an unfamiliar site alone does not cause probing: the layout check settles it first', () => {
  const { calls } = newPage().run(REPORT_TEXT, ['unfamiliarSite']);
  assert.deepEqual(calls, [...PASSIVE_FIRST, 'alertLayout']);
});

test('an unfamiliar site that looks like an alert is probed, until no strong trap can appear', () => {
  const { calls } = newPage().run(REPORT_TEXT, LOOKS_LIKE_ALERT);
  assert.deepEqual(calls, [...PASSIVE_FIRST, 'alertLayout', 'keysBlocked']);
});

test('an intrusive probe that keeps missing is retried only within its budget', () => {
  const page = newPage();
  let keyProbes = 0;
  for (let run = 0; run < CONFIG.PROBE_BUDGET * 3; run += 1) {
    keyProbes += page
      .run(REPORT_TEXT, LOOKS_LIKE_ALERT)
      .calls.filter((id) => id === 'keysBlocked').length;
  }
  assert.equal(keyProbes, CONFIG.PROBE_BUDGET);
});

test('the lock screen is blocked without ever running the unload probe', () => {
  const verdict = newPage().run(LOCK_SCREEN_TEXT, ['lockHeld', 'historyStuffed', 'unfamiliarSite']);
  assert.equal(verdict.blocked, true);
  assert.equal(verdict.calls.includes('unloadBlocked'), false);
});

test('a probe hit is remembered: the page is not probed for it again', () => {
  const page = newPage();
  page.run(REPORT_TEXT, [...LOOKS_LIKE_ALERT, 'keysBlocked']);
  const again = page.run(REPORT_TEXT, LOOKS_LIKE_ALERT);
  assert.equal(again.calls.includes('keysBlocked'), false);
  assert.equal(again.signals.includes('keysBlocked'), true);
});

test('a lock counts only while held: once released, it no longer adds to the score', () => {
  const page = newPage();
  assert.equal(page.run(REPORT_TEXT, ['lockHeld']).signals.includes('lockHeld'), true);
  const released = page.run(REPORT_TEXT);
  assert.equal(released.calls.includes('lockHeld'), true);
  assert.equal(released.signals.includes('lockHeld'), false);
});
