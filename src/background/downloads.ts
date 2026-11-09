// Warns about program files that a page builds in script and saves from a blob: or data: URL
// ("HTML smuggling"). The file is never touched here; the notice lets the user delete it.

import type { SignalId } from '../shared/protocol.ts';
import { debug } from './debug.ts';
import { isUnfamiliarSite, originOfUrl } from './familiarity.ts';
import { showNotice } from './notice.ts';

// Files Windows or macOS will run or mount on a double click.
const PROGRAM_TYPES = new Set([
  ...['exe', 'msi', 'msix', 'appx', 'scr', 'com', 'pif', 'cpl', 'dll', 'jar', 'reg', 'lnk'],
  ...['bat', 'cmd', 'ps1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'hta'],
  ...['iso', 'img', 'vhd', 'vhdx', 'dmg', 'pkg'],
]);
const WARNING_REASONS: SignalId[] = ['riskyDownload', 'unfamiliarSite'];

export interface DownloadFacts {
  url: string;
  filename: string;
  unfamiliarSite: boolean;
}

export function isProgramFile(filename: string): boolean {
  return PROGRAM_TYPES.has(filename.split('.').pop()?.toLowerCase() ?? '');
}

/** True for a program file saved from a URL that exists only inside the page. */
export function isSmuggledProgram(url: string, filename: string): boolean {
  return /^(?:blob|data):/i.test(url) && isProgramFile(filename);
}

/** Only on sites the user has no past with. Nothing a page can switch on widens this rule. */
export function shouldWarnAboutDownload(facts: DownloadFacts): boolean {
  return facts.unfamiliarSite && isSmuggledProgram(facts.url, facts.filename);
}

// Cheap tests first: ordinary downloads stop here without any history lookup.
async function findSmuggledProgram(
  delta: chrome.downloads.DownloadDelta,
): Promise<chrome.downloads.DownloadItem | null> {
  if (!delta.filename && delta.state?.current !== 'complete') {
    return null;
  }
  const [item] = await chrome.downloads.search({ id: delta.id });
  const present = item !== undefined && item.state !== 'interrupted' && item.exists;
  return present && isSmuggledProgram(item.url, item.filename) ? item : null;
}

// The notice opens beside the tab that started the download, or failing that the active one.
async function warn(item: chrome.downloads.DownloadItem): Promise<void> {
  const tabs = await chrome.tabs.query({});
  const beside =
    tabs.find((tab) => item.referrer !== '' && tab.url === item.referrer) ??
    tabs.find((tab) => tab.active);
  if (beside) {
    await showNotice({ kind: 'download', signals: WARNING_REASONS, beside, downloadId: item.id });
  }
}

// A download changes state several times within milliseconds; each file is judged once.
const judged = new Set<number>();

/** Runs when a download gets its file name or finishes. */
export async function onDownloadChanged(delta: chrome.downloads.DownloadDelta): Promise<void> {
  try {
    const item = await findSmuggledProgram(delta);
    if (!item || judged.has(item.id)) {
      return;
    }
    judged.add(item.id);
    // A data: URL has no origin of its own, so the page that started the download stands in.
    const origin = originOfUrl(item.url) ?? originOfUrl(item.referrer);
    const unfamiliarSite = await isUnfamiliarSite(origin);
    if (shouldWarnAboutDownload({ url: item.url, filename: item.filename, unfamiliarSite })) {
      await warn(item);
    }
  } catch (error) {
    debug('download check failed', error);
  }
}
