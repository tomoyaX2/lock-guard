// What a web page cannot make the extension do, and the features that act only on the user's
// say-so: the close shortcut and the remote-tool warning. Host names map to this machine.

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { Browser, Page } from 'puppeteer';

import { SHIELD_EVENTS } from '../src/shared/protocol.ts';
import {
  LEGACY_LOAD,
  forgeShieldEvents,
  noticePages,
  noticeText,
  openPage,
  serviceWorker,
  sleep,
  startServer,
  waitFor,
  withBrowser,
} from './harness.ts';

const server = await startServer();
after(() => server.close());
const HOSTS = `--host-resolver-rules=MAP anydesk.com 127.0.0.1:${server.port}, MAP notanydesk.com 127.0.0.1:${server.port}`;
const isNotice = (url: string): boolean => url.includes('/blocked/blocked.html');
const FORGED = Object.values(SHIELD_EVENTS);

/** Visits the host in a new tab; returns that tab if the site was replaced by a warning. */
async function warningOn(browser: Browser, host: string): Promise<Page | null> {
  const { page } = await openPage(browser, `http://${host}/benign.html`);
  return (await waitFor(() => isNotice(page.url()), 2500)) ? page : null;
}

async function isWarnedOn(browser: Browser, host: string): Promise<boolean> {
  return (await warningOn(browser, host)) !== null;
}

async function closeScam(browser: Browser): Promise<boolean> {
  const { page } = await openPage(browser, `${server.base}/malicious.html`);
  return waitFor(() => page.isClosed(), 6000);
}

test('remote-tool sites are interrupted only shortly after a real scam', () =>
  withBrowser({ args: [HOSTS] }, async (browser) => {
    assert.equal(await isWarnedOn(browser, 'anydesk.com'), false, 'warned on a normal day');
    const forger = await browser.newPage();
    await forger.goto(`${server.base}/benign.html`);
    await forger.evaluate(forgeShieldEvents, FORGED);
    await sleep(1500);
    assert.equal(
      await isWarnedOn(browser, 'anydesk.com'),
      false,
      'a forged event started the alert',
    );
    assert.ok(await closeScam(browser), 'setup: the scam was not closed');
    const warning = await warningOn(browser, 'anydesk.com');
    assert.ok(warning, 'no warning after a scam');
    await sleep(400);
    const button = await warning.$eval('button#continue', (b) => ({
      hidden: b.hidden,
      disabled: b.disabled,
    }));
    assert.deepEqual(button, { hidden: false, disabled: true });
    assert.equal(
      await isWarnedOn(browser, 'notanydesk.com'),
      false,
      'a look-alike host was warned',
    );
  }));

// Automation cannot press a browser shortcut, so the command event is fired in the worker.
// Older Chrome does not let DevTools run code in an extension's worker.
const NO_WORKER = {
  skip: LEGACY_LOAD && 'this Chrome version gives DevTools no access to the worker',
};
async function pressShortcut(browser: Browser): Promise<void> {
  const { worker } = await serviceWorker(browser);
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const event = chrome.commands.onCommand as unknown as {
      dispatch: (...args: unknown[]) => void;
    };
    event.dispatch('close-trapped-page', tab);
  });
}

test(
  'the shortcut closes an ordinary page without calling it a scam or starting an alert',
  NO_WORKER,
  () =>
    withBrowser({ args: [HOSTS] }, async (browser) => {
      const page = await browser.newPage();
      await page.goto(`${server.base}/benign.html`);
      await page.bringToFront();
      await pressShortcut(browser);
      assert.ok(await waitFor(() => page.isClosed(), 4000));
      const text = await noticeText(browser);
      assert.match(text, /^The page was closed/);
      assert.match(text, /You asked Lock Guard/);
      assert.doesNotMatch(text.split('|')[0] ?? '', /scam/i);
      assert.equal(await isWarnedOn(browser, 'anydesk.com'), false);
    }),
);

test('the shortcut on a page with unsaved work lets the browser ask first', NO_WORKER, () =>
  withBrowser({}, async (browser) => {
    const editor = await browser.newPage();
    await editor.goto(`${server.base}/benign.html`);
    await editor.evaluate(() =>
      window.addEventListener('beforeunload', (event) => event.preventDefault()),
    );
    await editor.bringToFront();
    await editor.mouse.click(300, 300);
    const asked: string[] = [];
    editor.on('dialog', (dialog) => {
      asked.push(dialog.type());
      dialog.dismiss().catch(() => undefined);
    });
    await pressShortcut(browser);
    await waitFor(() => asked.length > 0, 4000);
    await sleep(900);
    assert.deepEqual(asked, ['beforeunload']);
    assert.equal(editor.isClosed(), false, 'choosing Cancel did not keep the page');
    assert.equal((await noticePages(browser)).length, 0);
  }),
);

test('a web page cannot message, fetch or detect the extension', () =>
  withBrowser({}, async (browser) => {
    const { id } = await serviceWorker(browser);
    const { page } = await openPage(browser, `${server.base}/benign.html`);
    const probe = await page.evaluate(async (extensionId) => {
      const noticeUrl = `chrome-extension://${extensionId}/blocked/blocked.html`;
      const fetched = await fetch(noticeUrl).then(
        () => true,
        () => false,
      );
      const marker = Object.getOwnPropertySymbols(globalThis).some((s) =>
        String(s).includes('lockguard'),
      );
      return {
        canMessage:
          typeof chrome !== 'undefined' && typeof chrome.runtime?.sendMessage === 'function',
        fetched,
        leaked: 'LockGuard' in window || marker,
        nativeAlert: /\[native code\]/.test(String(Reflect.get(window, 'alert'))),
      };
    }, id);
    assert.deepEqual(probe, {
      canMessage: false,
      fetched: false,
      leaked: false,
      nativeAlert: true,
    });
  }));

test('forged shield events on an ordinary page do nothing', () =>
  withBrowser({}, async (browser) => {
    const { page } = await openPage(browser, `${server.base}/benign.html`);
    await page.evaluate(forgeShieldEvents, FORGED);
    await sleep(1500);
    assert.equal((await noticePages(browser)).length, 0);
    assert.equal(page.isClosed(), false);
  }));
