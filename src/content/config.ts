// Every tunable of the detector: weights, threshold, phrase lists, caps and timeouts. Behaviour
// and context carry most of the weight; the four wording signals add up to 35 of the 100 needed.

import type { ScoredSignal } from '../shared/protocol.ts';

const WEIGHTS = {
  keysBlocked: 30,
  lockHeld: 30,
  historyStuffed: 25,
  dialogFlood: 20,
  unloadBlocked: 25,
  contextMenuBlocked: 10,
  alertLayout: 10,
  unfamiliarSite: 30,
  recentBlock: 15,
  threatPhrase: 15,
  phoneCallToAction: 10,
  brand: 5,
  errorCode: 5,
} as const satisfies Record<ScoredSignal, number>;

// A verdict needs at least one of these. Unload guards and custom menus are common in real
// apps, and wording is easy to change, so neither can carry a block on its own.
const STRONG_TRAPS: readonly ScoredSignal[] = [
  'keysBlocked',
  'lockHeld',
  'historyStuffed',
  'dialogFlood',
];

// These run on attacker-controlled text, so none may use nested quantifiers.
const PATTERNS = Object.freeze({
  THREAT: Object.freeze([
    /\b(?:computer|pc|device|mac|system|browser|windows) (?:has been|is|was) (?:locked|blocked|infected|compromised|disabled|hacked)\b/,
    /\b(?:do not|don't|dont) (?:restart|shut ?down|turn off|close this|ignore this)\b/,
    /\b(?:virus|trojan|spyware|malware|ransomware) (?:has been |was )?(?:detected|found)\b/,
    /\b(?:security|virus|firewall|defender) (?:alert|warning|breach)\b/,
    /\b(?:unusual|suspicious) activity\b/,
    /\baccess (?:has been|is) (?:blocked|suspended|restricted)\b/,
  ]),
  BRAND: /\b(?:microsoft|windows|defender|apple|macos|mac os|icloud)\b/,
  CALL_TO_ACTION: /\b(?:call|contact|dial|phone|toll[- ]?free|helpline|hotline|support)\b/,
  PHONE: /(?<!\d)(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g,
  ERROR_CODE: /\b0x[0-9a-f]{6,8}\b/,
});

export const CONFIG = Object.freeze({
  BLOCK_THRESHOLD: 100,
  WEIGHTS: Object.freeze(WEIGHTS),
  STRONG_TRAPS,
  PATTERNS,

  TEXT_LIMIT_CHARS: 20_000,
  TEXT_NODE_LIMIT: 5_000,
  PHONE_CONTEXT_CHARS: 80,
  PHONE_MATCH_LIMIT: 20,
  HISTORY_GROWTH_LIMIT: 5,
  VIEWPORT_FILL_RATIO: 0.9,
  // A heading margin can push an alert-style page a few pixels past the window.
  VIEWPORT_OVERFLOW_RATIO: 1.15,

  // How many times one synthetic-event probe may run in a document's lifetime.
  PROBE_BUDGET: 5,
  // A change on a quiet page is checked after the short wait; never more often than the long one.
  MUTATION_SETTLE_MS: 100,
  MUTATION_THROTTLE_MS: 2_000,
  MUTATION_RUN_LIMIT: 20,
  INPUT_THROTTLE_MS: 1_000,
  LOCK_SETTLE_MS: 50,
  // Longer than the service worker's whole close-and-verify chain.
  SELF_RESCUE_MS: 4_000,
});

export type Config = typeof CONFIG;
