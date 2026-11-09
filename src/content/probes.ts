// Entrapment and layout checks, passive first and most intrusive last. Probes send cancelable
// synthetic events and read whether the page cancelled them, which also sees older listeners.

import type { PageContext, ScoredSignal } from '../shared/protocol.ts';
import { CONFIG } from './config.ts';
import type { ShieldSignals } from './feeds.ts';

export interface Check {
  readonly id: ScoredSignal;
  /** Sends events into the page, so it is budgeted and run only when it can matter. */
  readonly intrusive: boolean;
  readonly run: () => boolean;
}

// Refresh, devtools and close. Escape is left out: probing it would close dialogs in
// legitimate apps. keyCode is set because scam kits commonly test it, not key.
const KEY_PROBES: readonly KeyboardEventInit[] = [
  { key: 'F5', code: 'F5', keyCode: 116 },
  { key: 'F12', code: 'F12', keyCode: 123 },
  { key: 'r', code: 'KeyR', keyCode: 82, ctrlKey: true },
  { key: 'w', code: 'KeyW', keyCode: 87, ctrlKey: true },
  { key: 'r', code: 'KeyR', keyCode: 82, metaKey: true },
  { key: 'w', code: 'KeyW', keyCode: 87, metaKey: true },
];
const EVENT_FLAGS = { bubbles: true, cancelable: true, composed: true };

/** True when a page listener cancelled the event. */
function isCancelledByPage(event: Event): boolean {
  const target: EventTarget = document.body ?? document.documentElement;
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

function keysBlocked(): boolean {
  return KEY_PROBES.some((probe) => {
    const init: KeyboardEventInit = { ...EVENT_FLAGS, ...probe, which: probe.keyCode };
    return isCancelledByPage(new KeyboardEvent('keydown', init));
  });
}

function contextMenuBlocked(): boolean {
  const init: MouseEventInit = { ...EVENT_FLAGS, button: 2, buttons: 2, view: window };
  return isCancelledByPage(new MouseEvent('contextmenu', init));
}

// A real BeforeUnloadEvent, not a plain Event: only then does the very common
// `window.onbeforeunload = () => 'text'` style show up as a cancellation.
function unloadBlocked(): boolean {
  const event = document.createEvent('BeforeUnloadEvent');
  event.initEvent('beforeunload', false, true);
  window.dispatchEvent(event);
  return event.defaultPrevented || Boolean(event.returnValue);
}

// The page fills the window like a system dialog: body as tall as the viewport and next to
// nothing to scroll. Reads geometry, so it forces layout; it runs only when it can matter.
function alertLayout(): boolean {
  const scroller = document.scrollingElement;
  const { body } = document;
  if (!scroller || !body) {
    return false;
  }
  const nothingToScroll =
    scroller.scrollHeight <= window.innerHeight * CONFIG.VIEWPORT_OVERFLOW_RATIO;
  const bodyHeight = body.getBoundingClientRect().height;
  return nothingToScroll && bodyHeight >= window.innerHeight * CONFIG.VIEWPORT_FILL_RATIO;
}

export interface CheckInputs {
  /** Read at document_start, before the page can add entries. */
  historyLengthAtStart: number;
  shield: ShieldSignals;
  context: PageContext;
}

/** The checks in the order they run. A lock counts only while it is held: once released, the
 *  page traps nobody, so a slideshow that once went full screen is not marked for good. */
export function createChecks({ historyLengthAtStart, shield, context }: CheckInputs): Check[] {
  const lockHeld = (): boolean =>
    document.fullscreenElement !== null || document.pointerLockElement !== null;
  const historyStuffed = (): boolean =>
    history.length - historyLengthAtStart >= CONFIG.HISTORY_GROWTH_LIMIT;
  return [
    { id: 'lockHeld', intrusive: false, run: lockHeld },
    { id: 'historyStuffed', intrusive: false, run: historyStuffed },
    { id: 'dialogFlood', intrusive: false, run: () => shield.dialog },
    { id: 'unfamiliarSite', intrusive: false, run: () => context.unfamiliarSite },
    { id: 'recentBlock', intrusive: false, run: () => context.recentBlock },
    // Before the probes: on a page that does not look like an alert, they often need not run.
    { id: 'alertLayout', intrusive: false, run: alertLayout },
    { id: 'keysBlocked', intrusive: true, run: keysBlocked },
    { id: 'contextMenuBlocked', intrusive: true, run: contextMenuBlocked },
    { id: 'unloadBlocked', intrusive: true, run: unloadBlocked },
  ];
}
