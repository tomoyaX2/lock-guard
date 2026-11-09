// Decides when to evaluate and what to do on a verdict. Re-checks are event-driven and
// budgeted, so a lock screen that appears late or after the first click is still caught.

import {
  MESSAGE_ARM,
  MESSAGE_DETECTED,
  isMessageOfType,
  type DetectedMessage,
  type DetectedReply,
  type ScoredSignal,
} from '../shared/protocol.ts';
import { CONFIG } from './config.ts';
import type { Neutraliser } from './neutraliser.ts';
import type { Verdict } from './score.ts';

const LOCK_EVENTS = ['fullscreenchange', 'pointerlockchange'] as const;
const INPUT_EVENTS = ['pointerdown', 'keydown'] as const;
const LISTENER_OPTIONS: AddEventListenerOptions = { capture: true, passive: true };

// The Keyboard Lock API is Chromium-only and missing from TypeScript's DOM types.
interface KeyboardLockNavigator {
  keyboard?: { unlock?: () => void };
}

export class Detector {
  readonly #neutraliser: Neutraliser;
  readonly #evaluate: () => Verdict;
  readonly #observer = new MutationObserver(() => {
    this.#onMutation();
  });
  #pendingTimer: ReturnType<typeof setTimeout> | undefined;
  #pendingDue = Infinity;
  #mutationRuns = 0;
  #lastRunAt = -Infinity;

  constructor(neutraliser: Neutraliser, evaluate: () => Verdict) {
    this.#neutraliser = neutraliser;
    this.#evaluate = evaluate;
  }

  start(): void {
    chrome.runtime.onMessage.addListener(this.#onMessage);
    window.addEventListener('pageshow', this.#onPageShow);
    window.addEventListener('pagehide', this.#stopWatching);
    window.addEventListener('load', () => this.#schedule(0), { once: true });
    this.#startWatching();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.#schedule(0), { once: true });
    } else {
      this.#schedule(0);
    }
  }

  /** Evaluates again shortly; called when new evidence arrives from outside this script. */
  recheck(): void {
    this.#schedule(CONFIG.LOCK_SETTLE_MS);
  }

  /** Activates the neutraliser and frees the user's input; idempotent. */
  disarmPage(): void {
    this.#neutraliser.state.blocked = true;
    this.#stopWatching();
    releaseLocks();
  }

  /** Runs once, `delay` ms from now, unless an earlier run is already pending. */
  #schedule(delay: number): void {
    const due = Date.now() + delay;
    if (this.#neutraliser.state.blocked || due >= this.#pendingDue) {
      return;
    }
    clearTimeout(this.#pendingTimer);
    this.#pendingDue = due;
    this.#pendingTimer = setTimeout(() => this.#run(), delay);
  }

  #run(): void {
    this.#pendingDue = Infinity;
    this.#lastRunAt = Date.now();
    if (this.#neutraliser.state.blocked) {
      return;
    }
    // document.open() strips every listener from window, ours included; put them back.
    this.#neutraliser.arm();
    const verdict = this.#evaluate();
    if (verdict.blocked) {
      this.#block(verdict.signals);
    }
  }

  #block(signals: ScoredSignal[]): void {
    this.disarmPage();
    setTimeout(selfRescue, CONFIG.SELF_RESCUE_MS);
    void report(signals);
  }

  #onMutation(): void {
    if (this.#mutationRuns >= CONFIG.MUTATION_RUN_LIMIT) {
      this.#observer.disconnect();
      return;
    }
    if (this.#pendingDue === Infinity) {
      this.#mutationRuns += 1;
      // Soon after a change on a quiet page; a page that keeps changing gets a slow, steady rate.
      const sinceLastRun = Date.now() - this.#lastRunAt;
      const wait = CONFIG.MUTATION_THROTTLE_MS - sinceLastRun;
      this.#schedule(Math.max(CONFIG.MUTATION_SETTLE_MS, wait));
    }
  }

  // Our own probes are untrusted events; reacting to them would loop forever.
  readonly #onInput = (event: Event): void => {
    if (event.isTrusted) {
      this.#schedule(CONFIG.INPUT_THROTTLE_MS);
    }
  };

  readonly #onLockChange = (): void => {
    this.#schedule(CONFIG.LOCK_SETTLE_MS);
  };

  // Restored from the back/forward cache: timers resume but the verdict must be redone.
  readonly #onPageShow = (event: PageTransitionEvent): void => {
    if (event.persisted) {
      this.#neutraliser.state.blocked = false;
      this.#startWatching();
      this.#schedule(0);
    }
  };

  // The service worker sends this before a manual close from the toolbar button.
  readonly #onMessage = (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: { armed: boolean }) => void,
  ): void => {
    if (sender.id === chrome.runtime.id && isMessageOfType(message, MESSAGE_ARM)) {
      this.disarmPage();
      sendResponse({ armed: true });
    }
  };

  #startWatching(): void {
    // `document`, not documentElement: document.open() replaces the root element.
    this.#observer.observe(document, { childList: true, subtree: true, characterData: true });
    LOCK_EVENTS.forEach((type) => document.addEventListener(type, this.#onLockChange));
    INPUT_EVENTS.forEach((type) => window.addEventListener(type, this.#onInput, LISTENER_OPTIONS));
  }

  readonly #stopWatching = (): void => {
    this.#observer.disconnect();
    clearTimeout(this.#pendingTimer);
    this.#pendingDue = Infinity;
    LOCK_EVENTS.forEach((type) => document.removeEventListener(type, this.#onLockChange));
    INPUT_EVENTS.forEach((type) =>
      window.removeEventListener(type, this.#onInput, LISTENER_OPTIONS),
    );
  };
}

function releaseLocks(): void {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {
      // Already leaving full screen; the tab is about to close anyway.
    });
  }
  document.exitPointerLock();
  (navigator as Navigator & KeyboardLockNavigator).keyboard?.unlock?.();
}

// Last resort when the service worker cannot close the tab: leave by ourselves. The
// neutraliser is active by now, so the page's unload handler cannot object.
function selfRescue(): void {
  location.replace('about:blank');
}

async function report(signals: ScoredSignal[]): Promise<void> {
  try {
    const message: DetectedMessage = { type: MESSAGE_DETECTED, signals };
    const reply = await chrome.runtime.sendMessage<DetectedMessage, DetectedReply | undefined>(
      message,
    );
    if (!reply?.ok) {
      selfRescue();
    }
  } catch {
    // Worker unreachable, or the extension was reloaded and this script is orphaned.
    selfRescue();
  }
}
