// Names shared by every part of the extension: message types, page events, storage keys and
// the record a notice page shows. Signal ids and their sentences live in signals.ts.

import type { ScoredSignal, SignalId } from './signals.ts';

export * from './signals.ts';

export const MESSAGE_DETECTED = 'LOCK_GUARD_DETECTED';
export const MESSAGE_ARM = 'LOCK_GUARD_ARM';
export const MESSAGE_CONTEXT = 'LOCK_GUARD_CONTEXT';

/** The keyboard shortcut's command name; must match public/manifest.json. */
export const PANIC_COMMAND = 'close-trapped-page';

// Fired on `document` by the page-world shield and heard by the content script. A page can
// forge them, which only raises its own score; it cannot make them name another page.
export const SHIELD_EVENTS = Object.freeze({
  lock: 'lockguard-lock-request',
  dialog: 'lockguard-dialog-flood',
});

export interface DetectedMessage {
  type: typeof MESSAGE_DETECTED;
  signals: ScoredSignal[];
}

export interface DetectedReply {
  ok: boolean;
}

export interface ArmMessage {
  type: typeof MESSAGE_ARM;
}

/** What the service worker knows about a page that the page itself cannot tell. */
export interface PageContext {
  unfamiliarSite: boolean;
  recentBlock: boolean;
}

export type NoticeKind = 'scam' | 'manual' | 'download' | 'remote';

/** What the notice page in a tab shows: ids, a count and a time, never page content. */
export interface BlockedRecord {
  kind: NoticeKind;
  signals: SignalId[];
  time: number;
  count: number;
  windowId: number;
  stillOpen: boolean;
  /** Only for kind "remote": a host from the extension's own list, never a full URL. */
  remoteHost?: string;
  /** Only for kind "download": the browser's id for the file, so the user can delete it. */
  downloadId?: number;
}

export const BLOCKED_PAGE_PATH = 'blocked/blocked.html';
export const SCANNED_KEY = 'scanned';
export const ALERT_UNTIL_KEY = 'alertUntil';
export const REMOTE_ALLOWED_KEY = 'remoteAllowed';
const BLOCKED_KEY_PREFIX = 'blocked:';

/** Narrows an untrusted message to one with the given type field; the rest stays unknown. */
export function isMessageOfType<T extends string>(
  message: unknown,
  type: T,
): message is { type: T; [field: string]: unknown } {
  return (
    typeof message === 'object' && message !== null && 'type' in message && message.type === type
  );
}

export function blockedKey(tabId: number): string {
  return `${BLOCKED_KEY_PREFIX}${tabId}`;
}

export function isBlockedKey(key: string): boolean {
  return key.startsWith(BLOCKED_KEY_PREFIX);
}

export function tabIdFromBlockedKey(key: string): number {
  return Number(key.slice(BLOCKED_KEY_PREFIX.length));
}
