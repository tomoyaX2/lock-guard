// Closes a trapped tab and confirms it closed. Replacing beats navigating: the scam leaves no
// history or cache entry, full screen or lock behind for Back to return to.

import { MESSAGE_ARM, type ArmMessage, type SignalId } from '../shared/protocol.ts';
import { startAlert } from './alert.ts';
import { debug } from './debug.ts';
import { readTab, showNotice } from './notice.ts';
import { updateBlocked } from './store.ts';
import { isBlobUrl } from './validate.ts';

const CLOSE_CONFIRM_MS = 700;
const POLL_MS = 50;

export interface RescueRequest {
  tabId: number;
  expectedUrl: string;
  signals: SignalId[];
  /** Asked for by the user (toolbar or shortcut): any page may be closed, not only blob:. */
  manual?: boolean;
}

type OpenTab = chrome.tabs.Tab & { id: number };

/** Tabs with a rescue under way, so duplicate reports do not open duplicate pages. */
const inFlight = new Set<number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Skips a tab that moved on since detection. Fragments are ignored: a page can change its own. */
function isStillTrapped(tab: chrome.tabs.Tab, { expectedUrl, manual }: RescueRequest): boolean {
  const withoutFragment = (url: string): string => url.split('#')[0] ?? url;
  const sameDocument =
    tab.url !== undefined && withoutFragment(tab.url) === withoutFragment(expectedUrl);
  return sameDocument && (manual === true || isBlobUrl(tab.url));
}

/** Asks the content script to stop the page's unload, key and menu handlers. */
async function armPage(tabId: number): Promise<void> {
  try {
    const message: ArmMessage = { type: MESSAGE_ARM };
    await chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
  } catch {
    // No detector in that tab (not a blob: page, or injection refused). Closing proceeds.
  }
}

/** tabs.remove resolves even while an unload dialog holds the tab, so look for the tab after. */
async function removeAndConfirm(tabId: number): Promise<boolean> {
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    // Already gone, which the loop below confirms.
  }
  for (let waited = 0; waited <= CLOSE_CONFIRM_MS; waited += POLL_MS) {
    if (!(await readTab(tabId))) {
      return true;
    }
    await sleep(POLL_MS);
  }
  return false;
}

// Drops the document without running its unload handlers, so no "Leave site?" dialog blocks
// the close. Refused for a window's active tab (popups); the neutraliser covers that case.
async function discardDocument(tabId: number): Promise<number> {
  try {
    const discarded = await chrome.tabs.discard(tabId);
    return discarded?.id ?? tabId;
  } catch {
    return tabId;
  }
}

// Closes like the browser's own close button, so a page guarding unsaved work may still ask.
// If it asks, the browser's "Leave site?" dialog is on screen and nothing more is done here.
async function closePolitely(tab: OpenTab, signals: SignalId[]): Promise<boolean> {
  const closed = await removeAndConfirm(tab.id);
  if (closed) {
    await showNotice({ kind: 'manual', signals, beside: tab });
  }
  return closed;
}

/** Closes without letting the page object. Only a detector verdict starts the alert period. */
async function closeByForce(tab: OpenTab, { signals, manual }: RescueRequest): Promise<boolean> {
  await armPage(tab.id);
  if (!manual) {
    await startAlert();
  }
  const kind = manual ? 'manual' : 'scam';
  const noticeTabId = await showNotice({ kind, signals, beside: tab });
  const closed = await removeAndConfirm(await discardDocument(tab.id));
  if (!closed) {
    await updateBlocked(noticeTabId, { stillOpen: true });
  }
  return closed;
}

/** True when the trapped tab is confirmed closed. */
export async function rescueTab(request: RescueRequest): Promise<boolean> {
  const { tabId, signals, manual } = request;
  if (inFlight.has(tabId)) {
    return true;
  }
  inFlight.add(tabId);
  try {
    const trapped = await readTab(tabId);
    if (!trapped || !isStillTrapped(trapped, request)) {
      return false;
    }
    const tab: OpenTab = { ...trapped, id: tabId };
    // The shortcut on an ordinary page must not cost the user unsaved work by accident.
    const polite = manual === true && !isBlobUrl(trapped.url);
    return await (polite ? closePolitely(tab, signals) : closeByForce(tab, request));
  } catch (error) {
    debug('rescue failed', error);
    return false;
  } finally {
    inFlight.delete(tabId);
  }
}
