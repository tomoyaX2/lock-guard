// The provided samples and harder variants: scams are closed with no "Leave site?" dialog,
// legitimate blob: pages are left alone and never probed.

import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import {
  bodyText,
  isBlob,
  noticePages,
  openPage,
  pageValue,
  popup,
  sleep,
  startServer,
  trackDialogs,
  waitFor,
  withBrowser,
} from './harness.ts';

const server = await startServer();
after(() => server.close());
const url = (file: string): string => `${server.base}/${file}`;

test('malicious.html is closed and explained, and a second one reuses the notice', () =>
  withBrowser({}, async (browser) => {
    const { page, dialogs } = await openPage(browser, url('malicious.html'));
    assert.ok(await waitFor(() => page.isClosed(), 6000), 'the scam tab is still open');
    assert.deepEqual(dialogs, [], 'an unload dialog appeared');
    const [notice, ...extra] = await noticePages(browser);
    assert.ok(notice && extra.length === 0, 'expected exactly one notice page');
    await sleep(300);
    const text = await bodyText(notice);
    assert.match(text, /blocked the keys/);
    assert.match(text, /phone a support number/);
    assert.doesNotMatch(text, /555|0x8007|Microsoft/i, 'the notice echoed scam text');

    const again = await openPage(browser, url('malicious.html'));
    assert.ok(await waitFor(() => again.page.isClosed(), 6000));
    await sleep(300);
    const notices = await noticePages(browser);
    assert.equal(notices.length, 1);
    assert.match(await bodyText(notices[0] ?? notice), /2 alerts in this window/);
  }));

test('a delayed lock screen is left alone while harmless, then closed', () =>
  withBrowser({}, async (browser) => {
    const { page, dialogs } = await openPage(
      browser,
      url('samples/malicious-delayed.html?delay=3'),
    );
    await waitFor(() => isBlob(page), 3000);
    await sleep(500);
    assert.equal(page.isClosed(), false, 'closed before it showed anything harmful');
    // Real input gives the page user activation, which is what lets unload prompts show.
    await page.mouse.click(200, 200);
    assert.ok(await waitFor(() => page.isClosed(), 12000), 'not closed after the lock screen');
    assert.deepEqual(dialogs, []);
  }));

test('benign.html: the report stays open and receives no synthetic events', () =>
  withBrowser({}, async (browser) => {
    const page = await popup(browser, url('benign.html'), '#view-report');
    await page.evaluate(() => {
      Reflect.set(window, '__untrusted', 0);
      for (const type of ['keydown', 'contextmenu', 'beforeunload']) {
        const count = (event: Event): void => {
          if (!event.isTrusted) {
            Reflect.set(window, '__untrusted', Number(Reflect.get(window, '__untrusted')) + 1);
          }
        };
        window.addEventListener(type, count, true);
      }
    });
    await page.mouse.click(100, 100);
    await sleep(3500);
    assert.equal(page.isClosed(), false);
    assert.match(await bodyText(page), /Monthly Report/);
    assert.equal(await pageValue(page, '__untrusted'), 0);
    assert.equal((await noticePages(browser)).length, 0);
  }));

test('benign-editor: scam wording plus soft traps is not enough; its unload guard still works', () =>
  withBrowser({}, async (browser) => {
    const page = await popup(browser, url('samples/benign-editor.html'), '#open-message');
    const dialogs = trackDialogs(page);
    await page.mouse.click(100, 100);
    await sleep(4500);
    assert.equal(page.isClosed(), false);
    assert.equal((await noticePages(browser)).length, 0);
    await page.close({ runBeforeUnload: true });
    await waitFor(() => dialogs.length > 0 || page.isClosed(), 3000);
    assert.ok(dialogs.includes('beforeunload'), 'the editor lost its own "Leave site?" prompt');
  }));

test('the layered scam is closed before any click, with no unload dialog', () =>
  withBrowser({}, async (browser) => {
    const { page, dialogs } = await openPage(browser, url('samples/malicious-layers.html'));
    assert.ok(await waitFor(() => page.isClosed(), 6000));
    assert.deepEqual(dialogs, []);
  }));

test('an image-only scam with no readable text is closed', () =>
  withBrowser({}, async (browser) => {
    const { page, dialogs } = await openPage(browser, url('samples/malicious-image.html'));
    assert.ok(await waitFor(() => page.isClosed(), 6000));
    assert.deepEqual(dialogs, []);
  }));
