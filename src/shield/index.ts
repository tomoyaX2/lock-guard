// Page-world entry, loaded in every top-level page at document_start. It does nothing, and
// leaves no trace in the page, unless this is a page the detector also watches.

import { isGuardedDocument } from '../content/gate.ts';
import { watchTraps } from './traps.ts';

// Stops a second copy when the worker injects into a tab that was already open.
const LOADED = Symbol.for('lockguard.shield');
const scope = globalThis as typeof globalThis & { [LOADED]?: true };

if (isGuardedDocument() && !scope[LOADED]) {
  scope[LOADED] = true;
  watchTraps();
}
