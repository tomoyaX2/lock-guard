// Pure scoring: page text in, deception signals out; signal ids in, verdict out.
// No DOM and no chrome.* access, so the unit tests run it under Node.

import { isScoredSignal, type ScoredSignal } from '../shared/protocol.ts';
import { CONFIG } from './config.ts';
import type { PageText } from './text.ts';

export interface Verdict {
  signals: ScoredSignal[];
  score: number;
  hasStrongTrap: boolean;
  blocked: boolean;
}

const { PATTERNS, WEIGHTS, STRONG_TRAPS } = CONFIG;

// A phone number counts only next to wording that asks for a call, so order numbers,
// invoice ids and plain contact pages do not qualify.
function hasPhoneCallToAction(text: string): boolean {
  let examined = 0;
  for (const match of text.matchAll(PATTERNS.PHONE)) {
    examined += 1;
    if (examined > CONFIG.PHONE_MATCH_LIMIT) {
      break;
    }
    const start = Math.max(0, match.index - CONFIG.PHONE_CONTEXT_CHARS);
    const end = match.index + match[0].length + CONFIG.PHONE_CONTEXT_CHARS;
    if (PATTERNS.CALL_TO_ACTION.test(text.slice(start, end))) {
      return true;
    }
  }
  return false;
}

export function deceptionSignals(page: PageText): ScoredSignal[] {
  const { text } = page;
  const found: ScoredSignal[] = [];
  if (PATTERNS.THREAT.some((pattern) => pattern.test(text))) {
    found.push('threatPhrase');
  }
  if (page.hasTelLink || hasPhoneCallToAction(text)) {
    found.push('phoneCallToAction');
  }
  if (PATTERNS.BRAND.test(text)) {
    found.push('brand');
  }
  if (PATTERNS.ERROR_CODE.test(text)) {
    found.push('errorCode');
  }
  return found;
}

/** Unknown ids are ignored and repeats count once, so the input may come from anywhere. */
export function decide(signals: Iterable<string>): Verdict {
  const known = [...new Set(signals)].filter(isScoredSignal);
  const score = known.reduce((sum, id) => sum + WEIGHTS[id], 0);
  const hasStrongTrap = known.some((id) => STRONG_TRAPS.includes(id));
  return {
    signals: known,
    score,
    hasStrongTrap,
    blocked: hasStrongTrap && score >= CONFIG.BLOCK_THRESHOLD,
  };
}
