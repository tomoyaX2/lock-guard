// Capture listeners that silence the page's key, menu and unload handlers once a verdict is in.
// Registered at document_start because capture listeners fire in registration order.

const TRAP_EVENTS = ['keydown', 'keyup', 'keypress', 'contextmenu', 'beforeunload'] as const;

export interface Neutraliser {
  /** Flip to true and the page's handlers for TRAP_EVENTS stop running. */
  readonly state: { blocked: boolean };
  /** Safe to call again: document.open() strips listeners, and the DOM ignores duplicates. */
  arm(): void;
}

/** Creates the listeners dormant and arms them at once. */
export function createNeutraliser(): Neutraliser {
  const state = { blocked: false };

  function neutralise(event: Event): void {
    if (state.blocked) {
      event.stopImmediatePropagation();
    }
  }

  function arm(): void {
    for (const type of TRAP_EVENTS) {
      window.addEventListener(type, neutralise, true);
    }
  }

  arm();
  return { state, arm };
}
