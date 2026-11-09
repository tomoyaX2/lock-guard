// Explains what Lock Guard stopped, using fixed sentences chosen by ids in the stored record,
// so nothing from a web page (title, URL, text, phone number) can appear on this page.

import {
  REMOTE_ALLOWED_KEY,
  SIGNAL_LABELS,
  blockedKey,
  type BlockedRecord,
} from '../shared/protocol.ts';
import { NOTICE_COPY } from './copy.ts';

// Long enough to read the warning and to break the rhythm of someone giving orders by phone.
const CONTINUE_DELAY_SECONDS = 10;

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`blocked.html is missing #${id}`);
  }
  return element;
}

function renderReasons(signals: readonly string[]): void {
  const items = signals
    .filter((id): id is keyof typeof SIGNAL_LABELS => Object.hasOwn(SIGNAL_LABELS, id))
    .map((id) => {
      const item = document.createElement('li');
      item.textContent = SIGNAL_LABELS[id];
      return item;
    });
  if (items.length > 0) {
    byId('reasons').replaceChildren(...items);
  }
}

// The destination is rebuilt from a host in the extension's own list, never a stored URL.
function offerContinue(remoteHost: string): void {
  const button = byId('continue') as HTMLButtonElement;
  if (!button.hidden) {
    return;
  }
  button.hidden = false;
  let remaining = CONTINUE_DELAY_SECONDS;
  const tick = (): void => {
    button.disabled = remaining > 0;
    button.textContent =
      remaining > 0 ? `Continue to the site (${remaining})` : 'Continue to the site';
    remaining -= 1;
    if (remaining >= 0) {
      setTimeout(tick, 1000);
    }
  };
  tick();
  button.addEventListener('click', () => {
    void continueTo(remoteHost);
  });
}

let offeredDownloadId: number | undefined;

/** Shows the delete button for a new file; a repeat render for the same file changes nothing. */
function offerRemove(downloadId: number | undefined): void {
  if (downloadId === offeredDownloadId) {
    return;
  }
  offeredDownloadId = downloadId;
  const button = byId('remove') as HTMLButtonElement;
  button.hidden = downloadId === undefined;
  button.disabled = false;
  button.textContent = 'Delete the file';
}

// Only ever run by the user's click. Cancelling first covers a download that is still running.
async function removeDownload(button: HTMLButtonElement): Promise<void> {
  const id = offeredDownloadId;
  if (id === undefined) {
    return;
  }
  button.disabled = true;
  try {
    await chrome.downloads.cancel(id);
    const [item] = await chrome.downloads.search({ id });
    if (item?.state === 'complete' && item.exists) {
      await chrome.downloads.removeFile(id);
    }
    button.textContent = 'File deleted';
  } catch {
    button.textContent = 'The file could not be deleted';
  }
}

async function continueTo(remoteHost: string): Promise<void> {
  // Remembered for the rest of the alert, so the warning is shown once, not on every visit.
  await chrome.storage.session.set({ [REMOTE_ALLOWED_KEY]: true });
  location.replace(`https://${remoteHost}/`);
}

/** `stored` was written by the service worker, so its shape is known, but it may be absent. */
function render(stored: unknown): void {
  if (!stored) {
    return;
  }
  const record = stored as BlockedRecord;
  const copy = NOTICE_COPY[record.kind];
  document.title = copy.title;
  byId('title').textContent = copy.title;
  byId('lead').textContent = copy.lead;
  byId('advice').textContent = copy.advice;
  byId('reasons-heading').textContent = copy.reasonsHeading;
  renderReasons(record.signals);
  byId('still-open').hidden = !record.stillOpen;
  const time = new Date(record.time).toLocaleTimeString();
  const events = record.count === 1 ? '1 alert' : `${record.count} alerts`;
  byId('summary').textContent = `${events} in this window. Last one at ${time}.`;
  offerRemove(record.kind === 'download' ? record.downloadId : undefined);
  if (record.kind === 'remote' && record.remoteHost) {
    offerContinue(record.remoteHost);
  }
}

async function start(): Promise<void> {
  const tab = await chrome.tabs.getCurrent();
  if (typeof tab?.id !== 'number') {
    return;
  }
  const tabId = tab.id;
  const key = blockedKey(tabId);

  byId('close').addEventListener('click', () => {
    void chrome.tabs.remove(tabId);
  });
  const remove = byId('remove') as HTMLButtonElement;
  remove.addEventListener('click', () => {
    void removeDownload(remove);
  });
  // The worker writes the record just after opening this tab, and again for later events.
  chrome.storage.session.onChanged.addListener((changes) => {
    const change = changes[key];
    if (change) {
      render(change.newValue);
    }
  });
  const stored: Record<string, unknown> = await chrome.storage.session.get(key);
  render(stored[key]);
}

void start();
