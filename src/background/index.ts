// Service worker entry. Only wires events to handlers; every listener is registered
// synchronously at top level, otherwise events that restart the worker would be lost.

import { MANUAL_SIGNAL, PANIC_COMMAND, type SignalId } from '../shared/protocol.ts';
import { onDownloadChanged } from './downloads.ts';
import { onMessage } from './messages.ts';
import { REMOTE_TOOL_FILTER, onBeforeNavigate } from './remote.ts';
import { rescueTab } from './rescue.ts';
import { scanOpenTabs } from './scan.ts';
import { forgetBlocked } from './store.ts';
import { isBlobUrl } from './validate.ts';

function closeOnRequest(tab: chrome.tabs.Tab | undefined, anyPage: boolean): void {
  if (typeof tab?.id !== 'number' || tab.url === undefined) {
    return;
  }
  // Web pages only: the browser's own pages and other extensions' pages are never trapped.
  if (isBlobUrl(tab.url) || (anyPage && /^(?:https?|file|data):/.test(tab.url))) {
    const signals: SignalId[] = [MANUAL_SIGNAL];
    void rescueTab({ tabId: tab.id, expectedUrl: tab.url, signals, manual: true });
  }
}

chrome.runtime.onMessage.addListener(onMessage);

// The toolbar button is easy to click by accident, so it acts on blob: pages only.
chrome.action.onClicked.addListener((tab) => {
  closeOnRequest(tab, false);
});

// The shortcut is handled by the browser before the page sees the keys, on any web page.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === PANIC_COMMAND) {
    closeOnRequest(tab, true);
  }
});

chrome.downloads.onChanged.addListener((delta) => {
  void onDownloadChanged(delta);
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  void onBeforeNavigate(details);
}, REMOTE_TOOL_FILTER);

chrome.tabs.onRemoved.addListener((tabId) => {
  void forgetBlocked(tabId);
});

void scanOpenTabs();
