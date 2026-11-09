// Trust boundary for incoming messages. Nothing in a message payload is believed: the tab to
// act on comes from the browser-attested sender, and signal ids are filtered to a known list.

import { SCORED_SIGNALS, isScoredSignal, type ScoredSignal } from '../shared/protocol.ts';

export type DetectorSender = chrome.runtime.MessageSender & {
  tab: chrome.tabs.Tab & { id: number; url: string };
};

export function isBlobUrl(url: string | undefined): url is string {
  return typeof url === 'string' && url.startsWith('blob:');
}

/** True only for our own content script running in the top frame of a tab showing blob:. */
export function isDetectorSender(sender: chrome.runtime.MessageSender): sender is DetectorSender {
  return (
    sender.id === chrome.runtime.id &&
    sender.frameId === 0 &&
    typeof sender.tab?.id === 'number' &&
    isBlobUrl(sender.tab.url)
  );
}

/** Known, de-duplicated signal ids. The manual marker is not a scored signal, so never passes. */
export function sanitiseSignals(raw: unknown): ScoredSignal[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return [...new Set(raw.filter(isScoredSignal))].slice(0, SCORED_SIGNALS.length);
}
