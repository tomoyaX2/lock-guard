// The service worker's trust boundary: what a message may claim, and which senders count.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isBlobUrl, isDetectorSender, sanitiseSignals } from '../src/background/validate.ts';
import { MESSAGE_DETECTED, SCORED_SIGNALS, isMessageOfType } from '../src/shared/protocol.ts';

const EXTENSION_ID = 'ebakoghedkbladlepfdmpbaclpnmmnlc';
// Stand-in for the one chrome.* value validate.ts reads.
Object.assign(globalThis, { chrome: { runtime: { id: EXTENSION_ID } } });

const tab = (url: string): chrome.tabs.Tab => ({ id: 7, url }) as chrome.tabs.Tab;
const sender = (
  overrides: Partial<chrome.runtime.MessageSender>,
): chrome.runtime.MessageSender => ({
  id: EXTENSION_ID,
  frameId: 0,
  tab: tab('blob:http://localhost:8000/abc'),
  ...overrides,
});

test('only our own top-frame content script on a blob: tab is a detector', () => {
  assert.equal(isDetectorSender(sender({})), true);
  assert.equal(isDetectorSender(sender({ id: 'some-other-extension' })), false);
  assert.equal(isDetectorSender(sender({ frameId: 3 })), false);
  assert.equal(isDetectorSender(sender({ tab: tab('https://example.com/') })), false);
  assert.equal(isDetectorSender(sender({ tab: undefined })), false);
});

test('signals are filtered to known scored ids, de-duplicated and capped', () => {
  const claimed = ['keysBlocked', 'keysBlocked', 'manual', '__proto__', 42, null, 'brand'];
  assert.deepEqual(sanitiseSignals(claimed), ['keysBlocked', 'brand']);
  assert.deepEqual(sanitiseSignals('keysBlocked'), []);
  const flood = Array.from({ length: 1000 }, (_, i) => SCORED_SIGNALS[i % SCORED_SIGNALS.length]);
  assert.equal(sanitiseSignals(flood).length, SCORED_SIGNALS.length);
});

test('message type checks accept only objects with the exact type', () => {
  assert.equal(isMessageOfType({ type: MESSAGE_DETECTED }, MESSAGE_DETECTED), true);
  assert.equal(isMessageOfType({ type: 'OTHER' }, MESSAGE_DETECTED), false);
  assert.equal(isMessageOfType(MESSAGE_DETECTED, MESSAGE_DETECTED), false);
  assert.equal(isMessageOfType(null, MESSAGE_DETECTED), false);
});

test('only blob: URLs count as blob URLs', () => {
  assert.equal(isBlobUrl('blob:null/1234'), true);
  assert.equal(isBlobUrl('https://example.com/blob:'), false);
  assert.equal(isBlobUrl(undefined), false);
});
