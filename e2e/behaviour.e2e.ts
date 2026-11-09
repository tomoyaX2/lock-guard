// The page-world shield on blob: pages: legitimate pages keep full screen, dialogs and
// history; only an endless run of dialogs is cut, and a scam that takes full screen is closed.

import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import {
  blobPage,
  isBlob,
  noticePages,
  noticeText,
  pageValue,
  popup,
  sleep,
  startServer,
  waitFor,
  withBrowser,
} from './harness.ts';

const server = await startServer();
after(() => server.close());

async function goFullscreen(withExtension: boolean): Promise<void> {
  await withBrowser({ withExtension }, async (browser) => {
    const deck = await popup(
      browser,
      `${server.base}/samples/benign-fullscreen.html`,
      '#open-deck',
    );
    await deck.bringToFront();
    await deck.click('#fullscreen');
    await sleep(1500);
    assert.equal(await deck.evaluate(() => document.fullscreenElement !== null), true);
    if (withExtension) {
      await sleep(2500);
      assert.equal(deck.isClosed(), false, 'a legitimate full-screen deck was closed');
      assert.equal((await noticePages(browser)).length, 0);
    }
  });
}

test('control: without the extension the deck goes full screen', () => goFullscreen(false));
test('a legitimate blob: deck goes full screen and stays open', () => goFullscreen(true));

const PLANNER = `<h1>Planner</h1><button id="ask">Delete four items</button><button id="nav">Next</button>
  <script>
    document.getElementById('ask').addEventListener('click', () => {
      window.__answers = [1, 2, 3, 4].map((n) => confirm('Delete item ' + n + '?'));
    });
    document.getElementById('nav').addEventListener('click', () => {
      for (let i = 0; i < 4; i += 1) history.pushState({ i }, '', '#step' + i);
    });
  </script>`;

test('a blob: app keeps four confirm() answers and four history entries', () =>
  withBrowser({}, async (browser) => {
    const page = await browser.newPage();
    let dialogs = 0;
    page.on('dialog', (dialog) => {
      dialogs += 1;
      dialog.accept().catch(() => undefined);
    });
    await blobPage(page, server.base, PLANNER);
    await page.click('#ask');
    await sleep(600);
    assert.equal(dialogs, 4);
    assert.deepEqual(await pageValue(page, '__answers'), [true, true, true, true]);
    const before = await page.evaluate(() => history.length);
    await page.click('#nav');
    const now = await page.evaluate(() => ({ length: history.length, hash: location.hash }));
    assert.deepEqual(now, { length: before + 4, hash: '#step3' });
    assert.equal((await noticePages(browser)).length, 0);
  }));

const REMINDERS = `<script>window.__shown = 0; window.__error = null;
  const timer = setInterval(() => {
    try { alert('Reminder'); window.__shown += 1; } catch (e) { window.__error = String(e); }
    if (window.__shown >= 7) clearInterval(timer);
  }, 1150);</script>`;

test('seven dialogs with pauses between them are all shown', () =>
  withBrowser({}, async (browser) => {
    const page = await browser.newPage();
    page.on('dialog', (dialog) => {
      dialog.accept().catch(() => undefined);
    });
    await blobPage(page, server.base, REMINDERS);
    const done = (): Promise<boolean> =>
      page.evaluate(
        () =>
          Number(Reflect.get(window, '__shown')) >= 7 || Reflect.get(window, '__error') !== null,
      );
    await waitFor(done, 12000, 200);
    assert.equal(await pageValue(page, '__shown'), 7);
    assert.equal(await pageValue(page, '__error'), null);
    assert.equal(page.isClosed(), false);
  }));

test('a dialog-loop scam shows five alerts, then is closed for that reason', () =>
  withBrowser({}, async (browser) => {
    const page = await browser.newPage();
    const kinds: string[] = [];
    page.on('dialog', (dialog) => {
      kinds.push(dialog.type());
      dialog.accept().catch(() => undefined);
    });
    await page.goto(`${server.base}/samples/malicious-dialogs.html`).catch(() => undefined);
    assert.ok(await waitFor(() => page.isClosed(), 10000), 'the dialog-loop scam stayed open');
    assert.equal(kinds.length, 5, `dialogs: ${kinds.join(',')}`);
    assert.equal(kinds.includes('beforeunload'), false);
    assert.match(await noticeText(browser), /alert boxes one after another/);
  }));

const ENDLESS = `<h1>Demo</h1><script>window.__iterations = 0;
  setTimeout(() => { while (true) { window.__iterations += 1; alert('again'); } }, 300);</script>`;

test('an endless alert loop on a harmless page is cut after five; the tab stays usable', () =>
  withBrowser({}, async (browser) => {
    const page = await browser.newPage();
    let dialogs = 0;
    page.on('dialog', (dialog) => {
      dialogs += 1;
      dialog.dismiss().catch(() => undefined);
    });
    await blobPage(page, server.base, ENDLESS);
    await sleep(3500);
    const answer = await Promise.race([
      pageValue(page, '__iterations'),
      sleep(3000).then(() => 'hung'),
    ]);
    assert.equal(dialogs, 5);
    assert.equal(answer, 6, 'the page did not get control back');
    assert.equal(page.isClosed(), false);
  }));

const ONE_TRAP = `<style>html,body{height:100%;margin:0}body{background:#002bff;color:#fff}</style>
  <h1>Your computer has been locked</h1><p>Call Microsoft Support: 1-800-555-0155</p>
  <script>document.addEventListener('click', () =>
    document.documentElement.requestFullscreen().catch(() => {}));</script>`;

test('a scam with one trap is left open until it takes full screen, then closed', () =>
  withBrowser({}, async (browser) => {
    const page = await browser.newPage();
    await blobPage(page, server.base, ONE_TRAP);
    await sleep(1100);
    assert.ok(isBlob(page) && !page.isClosed(), 'closed before it trapped anyone');
    await page.mouse.click(200, 200);
    assert.ok(await waitFor(() => page.isClosed(), 6000), 'not closed after taking full screen');
    assert.match(await noticeText(browser), /full screen mode/);
  }));
