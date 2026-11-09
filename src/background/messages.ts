// Answers messages from the content script. The tab, its URL and its site always come from
// the browser-attested sender; nothing in a message body is believed beyond its type.

import {
  MESSAGE_CONTEXT,
  MESSAGE_DETECTED,
  isMessageOfType,
  type DetectedReply,
  type PageContext,
} from '../shared/protocol.ts';
import { isAlertActive } from './alert.ts';
import { isUnfamiliarSite, originOfUrl } from './familiarity.ts';
import { rescueTab } from './rescue.ts';
import { isDetectorSender, sanitiseSignals, type DetectorSender } from './validate.ts';

type Reply = (response: DetectedReply | PageContext) => void;

async function replyWithRescue(
  sender: DetectorSender,
  signals: unknown,
  reply: Reply,
): Promise<void> {
  const request = {
    tabId: sender.tab.id,
    expectedUrl: sender.tab.url,
    signals: sanitiseSignals(signals),
  };
  reply({ ok: await rescueTab(request) });
}

async function replyWithContext(sender: DetectorSender, reply: Reply): Promise<void> {
  const unfamiliarSite = await isUnfamiliarSite(originOfUrl(sender.tab.url));
  reply({ unfamiliarSite, recentBlock: await isAlertActive() });
}

/** Returns true when the reply will be sent later, which keeps the message channel open. */
export function onMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  reply: Reply,
): boolean {
  if (!isDetectorSender(sender)) {
    return false;
  }
  if (isMessageOfType(message, MESSAGE_DETECTED)) {
    void replyWithRescue(sender, message.signals, reply);
    return true;
  }
  if (isMessageOfType(message, MESSAGE_CONTEXT)) {
    void replyWithContext(sender, reply);
    return true;
  }
  return false;
}
