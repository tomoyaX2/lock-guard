// During an alert, puts a warning in front of sites that offer remote-control software.
// Installing such a tool for a "technician" is the step where victims lose their computer.

import type { BlockedRecord } from '../shared/protocol.ts';
import { isAlertActive, isRemoteAllowed } from './alert.ts';
import { debug } from './debug.ts';
import { noticeUrl, readTab } from './notice.ts';
import { saveBlocked } from './store.ts';

export const REMOTE_TOOL_HOSTS: readonly string[] = [
  ...['anydesk.com', 'teamviewer.com', 'ultraviewer.net', 'rustdesk.com', 'supremocontrol.com'],
  ...['splashtop.com', 'logmein.com', 'logmein123.com', 'screenconnect.com', 'getscreen.me'],
  ...['remotedesktop.google.com', 'fastsupport.gotoassist.com', 'dwservice.net'],
  ...['hoptodesk.com', 'ammyy.com'],
];

/** The worker is woken only for these hosts, so ordinary browsing never runs this file. */
export const REMOTE_TOOL_FILTER = {
  url: REMOTE_TOOL_HOSTS.map((hostSuffix) => ({ hostSuffix })),
};

/** The listed host a URL belongs to, or null. A suffix alone is not enough: notanydesk.com. */
export function remoteToolHost(url: string): string | null {
  try {
    const { hostname, protocol } = new URL(url);
    if (!protocol.startsWith('http')) {
      return null;
    }
    return (
      REMOTE_TOOL_HOSTS.find((host) => hostname === host || hostname.endsWith(`.${host}`)) ?? null
    );
  } catch {
    return null;
  }
}

interface Navigation {
  frameId: number;
  tabId: number;
  url: string;
}

export async function onBeforeNavigate({ frameId, tabId, url }: Navigation): Promise<void> {
  const remoteHost = frameId === 0 ? remoteToolHost(url) : null;
  if (!remoteHost) {
    return;
  }
  try {
    if (!(await isAlertActive()) || (await isRemoteAllowed())) {
      return;
    }
    const tab = await readTab(tabId);
    if (!tab) {
      return;
    }
    const record: BlockedRecord = {
      kind: 'remote',
      signals: ['remoteTool'],
      remoteHost,
      time: Date.now(),
      count: 1,
      windowId: tab.windowId,
      stillOpen: false,
    };
    await saveBlocked(tabId, record);
    await chrome.tabs.update(tabId, { url: noticeUrl() });
  } catch (error) {
    debug('remote-tool warning failed', error);
  }
}
