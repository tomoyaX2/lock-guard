// One evaluation pass: read the text, then run checks in order until the verdict is settled
// or out of reach. That cut-off keeps synthetic events away from pages that look harmless.

import { CONFIG } from './config.ts';
import type { Check } from './probes.ts';
import { decide, deceptionSignals, type Verdict } from './score.ts';
import type { PageText } from './text.ts';

export interface EvaluatorParts {
  collect: () => PageText;
  checks: readonly Check[];
}

interface CheckRecord {
  hit: boolean;
  runs: number;
}

function isBlockReachable(verdict: Verdict, remaining: readonly Check[]): boolean {
  const potential = remaining.reduce((sum, check) => sum + CONFIG.WEIGHTS[check.id], 0);
  const strongPossible =
    verdict.hasStrongTrap || remaining.some((check) => CONFIG.STRONG_TRAPS.includes(check.id));
  return strongPossible && verdict.score + potential >= CONFIG.BLOCK_THRESHOLD;
}

/** Returns an evaluate() that remembers, for the life of the document, what each probe found. */
export function createEvaluator({ collect, checks }: EvaluatorParts): () => Verdict {
  const memory = new Map<string, CheckRecord>();

  // A probe hit is kept, so a page that trapped once is not probed again, and probe misses are
  // retried only within a budget. Passive checks read current state, so a lock released stops counting.
  function runCheck(check: Check): boolean {
    const record = memory.get(check.id) ?? { hit: false, runs: 0 };
    memory.set(check.id, record);
    if (check.intrusive && record.hit) {
      return true;
    }
    if (check.intrusive && record.runs >= CONFIG.PROBE_BUDGET) {
      return false;
    }
    record.runs += 1;
    try {
      record.hit = check.run();
    } catch {
      // One check failing on an unusual document must not stop the others.
      record.hit = false;
    }
    return record.hit;
  }

  return function evaluate(): Verdict {
    const found = new Set<string>(deceptionSignals(collect()));
    for (const [index, check] of checks.entries()) {
      const verdict = decide(found);
      if (verdict.blocked || !isBlockReachable(verdict, checks.slice(index))) {
        break;
      }
      if (runCheck(check)) {
        found.add(check.id);
      }
    }
    return decide(found);
  };
}
