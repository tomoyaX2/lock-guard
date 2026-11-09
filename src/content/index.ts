// Content-script entry, run in every top-level page at document_start. On anything but a
// script-capable blob: page it stops at the gate: no listeners, timers or messages.

import { Detector } from './detector.ts';
import { createEvaluator } from './evaluate.ts';
import { requestContext, watchShield } from './feeds.ts';
import { isGuardedDocument } from './gate.ts';
import { createNeutraliser } from './neutraliser.ts';
import { createChecks } from './probes.ts';
import type { Verdict } from './score.ts';
import { collectPageText } from './text.ts';

/** Exposed in the extension's isolated world only, for debugging from DevTools. */
interface DebugHandle {
  evaluate?: () => Verdict;
}

// Also the guard against running twice when the worker injects into an already-open tab.
const scope = globalThis as typeof globalThis & { LockGuard?: DebugHandle };

function startDetector(handle: DebugHandle): void {
  // First, before any page script that runs later can register its own capture listeners.
  const neutraliser = createNeutraliser();
  const recheck = (): void => detector.recheck();
  const checks = createChecks({
    historyLengthAtStart: history.length,
    shield: watchShield(recheck),
    context: requestContext(recheck),
  });
  const evaluate = createEvaluator({ collect: collectPageText, checks });
  const detector = new Detector(neutraliser, evaluate);
  handle.evaluate = evaluate;
  detector.start();
}

if (isGuardedDocument() && !scope.LockGuard) {
  scope.LockGuard = {};
  startDetector(scope.LockGuard);
}
