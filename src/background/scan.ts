// Injects the extension's scripts once per session into blob: tabs opened before they could
// run (install, update, re-enable, browser start); manifest scripts only reach later pages.

import { debug } from './debug.ts';
import { claimFirstScan } from './store.ts';
import { isBlobUrl } from './validate.ts';

type ScriptWorld = `${chrome.scripting.ExecutionWorld}`;
// The manifest's `world` key is newer than the type definitions.
type ScriptEntry = { js?: string[]; world?: ScriptWorld };

async function injectScripts(tabId: number): Promise<void> {
  // The manifest stays the single list of scripts and of the world each one runs in.
  const entries: ScriptEntry[] = chrome.runtime.getManifest().content_scripts ?? [];
  try {
    for (const { js: files = [], world = 'ISOLATED' } of entries) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files,
        world,
        injectImmediately: true,
      });
    }
  } catch (error) {
    // Refused, for example file:// without "Allow access to file URLs". The shortcut remains.
    debug('injection refused', tabId, error);
  }
}

export async function scanOpenTabs(): Promise<void> {
  try {
    if (!(await claimFirstScan())) {
      return;
    }
    const tabs = await chrome.tabs.query({});
    const blobTabIds = tabs.flatMap((tab) =>
      isBlobUrl(tab.url) && typeof tab.id === 'number' ? [tab.id] : [],
    );
    await Promise.all(blobTabIds.map((id) => injectScripts(id)));
  } catch (error) {
    debug('scan failed', error);
  }
}
