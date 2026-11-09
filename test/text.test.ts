import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CONFIG } from '../src/content/config.ts';
import { deceptionSignals } from '../src/content/score.ts';
import { normalise } from '../src/content/text.ts';

test('normalise lowercases and collapses whitespace', () => {
  assert.equal(
    normalise('  Your\n\tComputer   HAS been\u00A0locked '),
    'your computer has been locked',
  );
});

test('normalise removes invisible characters used to split words', () => {
  assert.equal(normalise('lo\u200Bck\u00ADed com\u2060puter\uFEFF'), 'locked computer');
});

test('normalise folds full-width look-alike letters', () => {
  assert.equal(normalise('\uFF4D\uFF49\uFF43\uFF52\uFF4F\uFF53\uFF4F\uFF46\uFF54'), 'microsoft');
});

test('obfuscated lock wording is still recognised after normalising', () => {
  const hidden = normalise('Your com\u200Bputer has been lo\u200Bcked');
  assert.equal(deceptionSignals({ text: hidden, hasTelLink: false })[0], 'threatPhrase');
});

test('patterns stay fast on hostile input at the size cap', () => {
  const limit = CONFIG.TEXT_LIMIT_CHARS;
  const hostile = [
    '1'.repeat(limit),
    '1-'.repeat(limit / 2),
    'do not '.repeat(limit / 7),
    '0x'.repeat(limit / 2),
  ];
  const started = performance.now();
  for (const value of hostile) {
    deceptionSignals({ text: value, hasTelLink: false });
  }
  assert.ok(performance.now() - started < 250, 'pattern matching took too long');
});
