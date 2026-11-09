// Opens or refreshes the notice page that explains what Lock Guard just stopped. One notice
// page per window, so a page that keeps misbehaving cannot make the extension spawn tabs.

import {
  BLOCKED_PAGE_PATH,
  type BlockedRecord,
  type NoticeKind,
  type SignalId,
} from '../shared/protocol.ts';
import { findBlockedInWindow, forgetBlocked, saveBlocked } from './store.ts';

export interface NoticeRequest {
  kind: NoticeKind;
  signals: SignalId[];
  /** The tab the notice is about; the notice opens next to it. */
  beside: chrome.tabs.Tab;
  /** Only for kind "download": the file the notice offers to delete. */
  downloadId?: number;
}

export function noticeUrl(): string {
  return chrome.runtime.getURL(BLOCKED_PAGE_PATH);
}

/** Null when the tab no longer exists. */
export async function readTab(tabId: number): Promise<chrome.tabs.Tab | null> {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

async function createNoticeTab(beside: chrome.tabs.Tab): Promise<chrome.tabs.Tab> {
  const url = noticeUrl();
  const { type } = await chrome.windows.get(beside.windowId);
  if (type === 'normal') {
    const placement = { windowId: beside.windowId, index: beside.index + 1 };
    return chrome.tabs.create({ url, active: beside.active, ...placement });
  }
  // Popup windows cannot hold a second tab; let the browser pick a normal window.
  return chrome.tabs.create({ url, active: true });
}

// A stored record may outlive its page: the user can navigate a notice tab somewhere else.
async function liveNoticeIn(
  windowId: number,
): Promise<{ tabId: number; record: BlockedRecord } | null> {
  const existing = await findBlockedInWindow(windowId);
  if (!existing) {
    return null;
  }
  const tab = await readTab(existing.tabId);
  if (tab?.url?.startsWith(noticeUrl()) && existing.record.kind !== 'remote') {
    return existing;
  }
  if (!tab) {
    await forgetBlocked(existing.tabId);
  }
  return null;
}

/** Returns the id of the tab showing the notice. */
export async function showNotice(request: NoticeRequest): Promise<number> {
  const { kind, signals, beside, downloadId } = request;
  const time = Date.now();
  const existing = await liveNoticeIn(beside.windowId);
  if (existing) {
    const count = existing.record.count + 1;
    const record = { ...existing.record, kind, signals, time, count, downloadId };
    await saveBlocked(existing.tabId, record);
    if (beside.active) {
      await chrome.tabs.update(existing.tabId, { active: true });
    }
    return existing.tabId;
  }
  const created = await createNoticeTab(beside);
  if (created.id === undefined) {
    throw new Error('The notice page was created without a tab id.');
  }
  const { windowId } = created;
  const record = { kind, signals, time, count: 1, windowId, stillOpen: false, downloadId };
  await saveBlocked(created.id, record);
  return created.id;
}
