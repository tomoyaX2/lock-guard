// Shared parts of the browser tests: a local server for the samples, a browser with the built
// extension, and small waits. Nothing here contacts the network.

import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { TargetType, type Browser, type Page, type WebWorker } from 'puppeteer';

const ROOT = path.resolve(import.meta.dirname, '..');
export const EXTENSION_DIR = path.join(ROOT, 'dist');
/** Older browsers such as Chrome 134 cannot load an extension over DevTools; use the switches. */
export const LEGACY_LOAD = Boolean(process.env.LEGACY_LOAD);
const EXECUTABLE = process.env.CHROME_PATH || undefined;
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript' };

export interface SampleServer {
  base: string;
  port: number;
  close: () => void;
}

async function serveFile(url: string, response: http.ServerResponse): Promise<void> {
  try {
    const file = path.join(ROOT, decodeURIComponent(new URL(url, 'http://x').pathname));
    const body = await readFile(file);
    const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
    response.writeHead(200, { 'content-type': type }).end(body);
  } catch {
    response.writeHead(404).end('not found');
  }
}

/** Serves the project folder on 127.0.0.1 at a free port. */
export async function startServer(): Promise<SampleServer> {
  const server = http.createServer((request, response) => {
    void serveFile(request.url ?? '/', response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, port, close: () => server.close() };
}

export interface LaunchOptions {
  withExtension?: boolean;
  args?: string[];
}

export function launch({ withExtension = true, args = [] }: LaunchOptions = {}): Promise<Browser> {
  const common = ['--no-first-run', '--no-default-browser-check', ...args];
  if (LEGACY_LOAD) {
    const load = [
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
    ];
    const all = withExtension ? [...common, ...load] : common;
    return puppeteer.launch({ headless: true, executablePath: EXECUTABLE, args: all });
  }
  const enableExtensions = withExtension ? [EXTENSION_DIR] : true;
  return puppeteer.launch({
    headless: true,
    pipe: true,
    executablePath: EXECUTABLE,
    enableExtensions,
    args: common,
  });
}

/** Runs one scenario in a fresh browser, closed afterwards whatever happens. */
export async function withBrowser(
  options: LaunchOptions,
  run: (browser: Browser) => Promise<void>,
): Promise<void> {
  const browser = await launch(options);
  try {
    await run(browser);
  } finally {
    await browser.close();
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  ms: number,
  step = 50,
): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await predicate()) {
      return true;
    }
    await sleep(step);
  }
  return false;
}

/** Records the type of every dialog the page opens, accepting each one. */
export function trackDialogs(page: Page): string[] {
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.type());
    dialog.accept().catch(() => undefined);
  });
  return dialogs;
}

/** Opens a URL in a new tab; a scam may close the tab before navigation settles. */
export async function openPage(
  browser: Browser,
  url: string,
): Promise<{ page: Page; dialogs: string[] }> {
  const page = await browser.newPage();
  const dialogs = trackDialogs(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  return { page, dialogs };
}

export const isBlob = (page: Page): boolean => page.url().startsWith('blob:');

/** Clicks a button that opens a blob: page in a new tab and returns that tab. */
export async function popup(browser: Browser, url: string, selector: string): Promise<Page> {
  const opener = await browser.newPage();
  await opener.goto(url);
  await opener.click(selector);
  const target = await browser.waitForTarget(
    (t) => t.type() === TargetType.PAGE && t.url().startsWith('blob:'),
    {
      timeout: 5000,
    },
  );
  const page = await target.page();
  if (!page) {
    throw new Error('the blob: tab has no page');
  }
  return page;
}

/** Turns an ordinary tab into a blob: page with this body, as a web app would. */
export async function blobPage(page: Page, base: string, body: string): Promise<void> {
  await page.goto(`${base}/benign.html`);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>App</title></head><body>${body}</body></html>`;
  await page.evaluate((source) => {
    location.href = URL.createObjectURL(new Blob([source], { type: 'text/html' }));
  }, html);
  await waitFor(() => isBlob(page), 3000);
  await sleep(400);
}

export async function noticePages(browser: Browser): Promise<Page[]> {
  return (await browser.pages()).filter((page) => page.url().includes('/blocked/blocked.html'));
}

export function bodyText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

/** Title and reasons of the notice page, once it has opened, or '' if none opens. */
export async function noticeText(browser: Browser): Promise<string> {
  await waitFor(async () => (await noticePages(browser)).length > 0, 3000);
  const [page] = await noticePages(browser);
  if (!page) {
    return '';
  }
  await sleep(300);
  return page.evaluate(() => {
    const read = (id: string): string => document.getElementById(id)?.textContent ?? '';
    return `${read('title')} | ${read('reasons')}`;
  });
}

/** Runs in the page: fires each of the shield's event names twenty times, as a forger would. */
export function forgeShieldEvents(names: string[]): void {
  for (const name of names) {
    for (let i = 0; i < 20; i += 1) {
      document.dispatchEvent(new Event(name));
    }
  }
}

/** A value a test page stored on window, for the test to inspect. */
export function pageValue(page: Page, name: string): Promise<unknown> {
  return page.evaluate((key) => Reflect.get(window, key) as unknown, name);
}

export async function serviceWorker(browser: Browser): Promise<{ id: string; worker: WebWorker }> {
  const target = await browser.waitForTarget((t) => t.type() === TargetType.SERVICE_WORKER, {
    timeout: 5000,
  });
  const worker = await target.worker();
  if (!worker) {
    throw new Error('the extension has no service worker');
  }
  return { id: new URL(target.url()).host, worker };
}

/** Switches the extension off or on the way the Extensions page does. */
export async function setExtensionEnabled(
  browser: Browser,
  id: string,
  enabled: boolean,
): Promise<void> {
  const settings = await browser.newPage();
  await settings.goto('chrome://extensions');
  await settings.evaluate(
    (extensionId, on) =>
      new Promise<void>((resolve) => chrome.management.setEnabled(extensionId, on, resolve)),
    id,
    enabled,
  );
  await settings.close();
}

/** Lets downloads through without a prompt, into a new temporary folder. */
export async function saveDownloadsTo(browser: Browser): Promise<string> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lockguard-dl-'));
  const session = await browser.target().createCDPSession();
  await session.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
  return dir;
}
