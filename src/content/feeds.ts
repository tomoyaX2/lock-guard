// Evidence that arrives from outside the content script: what the page-world shield saw,
// and what the service worker knows about the site. Both start empty and fill in later.

import { MESSAGE_CONTEXT, SHIELD_EVENTS, type PageContext } from '../shared/protocol.ts';

export interface ShieldSignals {
  /** A lock was asked for. Not evidence by itself, only a cue to look again once it takes hold. */
  lock: boolean;
  dialog: boolean;
}

/** `onChange` runs each time the shield reports something new. */
export function watchShield(onChange: () => void): ShieldSignals {
  const seen: ShieldSignals = { lock: false, dialog: false };
  const events: ReadonlyArray<[string, keyof ShieldSignals]> = [
    [SHIELD_EVENTS.lock, 'lock'],
    [SHIELD_EVENTS.dialog, 'dialog'],
  ];
  for (const [eventName, key] of events) {
    document.addEventListener(eventName, () => {
      if (!seen[key]) {
        seen[key] = true;
        onChange();
      }
    });
  }
  return seen;
}

async function fetchContext(target: PageContext, onChange: () => void): Promise<void> {
  try {
    const reply: unknown = await chrome.runtime.sendMessage({ type: MESSAGE_CONTEXT });
    if (typeof reply === 'object' && reply !== null) {
      const { unfamiliarSite, recentBlock } = reply as Partial<PageContext>;
      target.unfamiliarSite = unfamiliarSite === true;
      target.recentBlock = recentBlock === true;
      onChange();
    }
  } catch {
    // Worker unreachable: the page is judged on its own behaviour, without context.
  }
}

/** Asks the worker once; the returned object is updated when the answer arrives. */
export function requestContext(onChange: () => void): PageContext {
  const context: PageContext = { unfamiliarSite: false, recentBlock: false };
  void fetchContext(context, onChange);
  return context;
}
