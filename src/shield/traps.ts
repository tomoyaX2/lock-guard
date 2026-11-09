// Watches the trapping tools on a guarded page without taking them away: lock requests go
// through and are reported. Only a run of back-to-back dialogs is cut short.

import { SHIELD_EVENTS } from '../shared/protocol.ts';
import { override, report } from './report.ts';

const LOCK_METHODS = [
  'requestFullscreen',
  'webkitRequestFullscreen',
  'webkitRequestFullScreen',
  'requestPointerLock',
];
const DIALOG_METHODS = ['alert', 'confirm', 'prompt'];
// A dialog opened this soon after the last one closed was not asked for by the user.
const DIALOG_GAP_MS = 1_000;
const DIALOG_RUN_LIMIT = 5;

// Captured now, before any page script can replace it.
const now = Date.now.bind(Date);

function watch(target: object, name: string): void {
  const original = override(target, name, function (...args) {
    report(SHIELD_EVENTS.lock);
    return Reflect.apply(original ?? (() => undefined), this, args);
  });
}

function watchLocks(): void {
  for (const name of LOCK_METHODS) {
    watch(Element.prototype, name);
  }
  // The Keyboard Lock API is Chromium-only and missing from TypeScript's DOM types.
  const keyboard: unknown = Reflect.get(navigator, 'keyboard');
  if (typeof keyboard === 'object' && keyboard !== null) {
    watch(Object.getPrototypeOf(keyboard) as object, 'lock');
  }
}

// Throwing, not returning: an error is what gets a page out of `while (true) alert()`.
function breakDialogFloods(): void {
  let run = 0;
  let lastClosed = -Infinity;
  for (const name of DIALOG_METHODS) {
    const original = override(window, name, (...args) => {
      run = now() - lastClosed < DIALOG_GAP_MS ? run + 1 : 1;
      if (run > DIALOG_RUN_LIMIT) {
        lastClosed = now();
        report(SHIELD_EVENTS.dialog);
        throw new Error('Too many dialogs in a row (stopped by Lock Guard).');
      }
      try {
        return Reflect.apply(original ?? (() => undefined), window, args);
      } finally {
        lastClosed = now();
      }
    });
  }
}

export function watchTraps(): void {
  watchLocks();
  breakDialogFloods();
}
