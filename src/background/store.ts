// Session-scoped records of what each blocked page replaced: signal ids, a count and a time,
// never URLs or page text. Deleted when the blocked tab closes or the session ends.

import {
  SCANNED_KEY,
  blockedKey,
  isBlockedKey,
  tabIdFromBlockedKey,
  type BlockedRecord,
} from '../shared/protocol.ts';

const MAX_RECORDS = 50;

async function readRecords(): Promise<Array<[string, BlockedRecord]>> {
  const everything: Record<string, unknown> = await chrome.storage.session.get(null);
  // Only this module writes keys with the blocked: prefix, so their shape is known.
  return Object.entries(everything).filter(([key]) => isBlockedKey(key)) as Array<
    [string, BlockedRecord]
  >;
}

/** Stores the record for the blocked page in `tabId`, keeping at most MAX_RECORDS. */
export async function saveBlocked(tabId: number, record: BlockedRecord): Promise<void> {
  await chrome.storage.session.set({ [blockedKey(tabId)]: record });
  const records = await readRecords();
  if (records.length <= MAX_RECORDS) {
    return;
  }
  const oldestFirst = records.sort(([, a], [, b]) => a.time - b.time);
  const surplus = oldestFirst.slice(0, records.length - MAX_RECORDS).map(([key]) => key);
  await chrome.storage.session.remove(surplus);
}

export async function findBlockedInWindow(
  windowId: number,
): Promise<{ tabId: number; record: BlockedRecord } | null> {
  const records = await readRecords();
  const match = records.find(([, record]) => record.windowId === windowId);
  return match ? { tabId: tabIdFromBlockedKey(match[0]), record: match[1] } : null;
}

export async function updateBlocked(tabId: number, changes: Partial<BlockedRecord>): Promise<void> {
  const key = blockedKey(tabId);
  const stored: Record<string, unknown> = await chrome.storage.session.get(key);
  const current = stored[key] as BlockedRecord | undefined;
  if (current) {
    await chrome.storage.session.set({ [key]: { ...current, ...changes } });
  }
}

export async function forgetBlocked(tabId: number): Promise<void> {
  try {
    await chrome.storage.session.remove(blockedKey(tabId));
  } catch {
    // Storage is session-scoped; a failed delete is cleaned up when the session ends.
  }
}

/** True the first time it is called in this extension session. */
export async function claimFirstScan(): Promise<boolean> {
  const stored: Record<string, unknown> = await chrome.storage.session.get(SCANNED_KEY);
  if (stored[SCANNED_KEY]) {
    return false;
  }
  await chrome.storage.session.set({ [SCANNED_KEY]: true });
  return true;
}
