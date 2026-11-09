// A scam that was already on screen before the extension could act: installed afterwards,
// or switched back on. The worker finds the open blob: tab and injects the detector.

import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import {
  EXTENSION_DIR,
  LEGACY_LOAD,
  isBlob,
  noticePages,
  openPage,
  serviceWorker,
  setExtensionEnabled,
  sleep,
  startServer,
  waitFor,
  withBrowser,
} from './harness.ts';

const server = await startServer();
after(() => server.close());
const NEEDS_INSTALL = LEGACY_LOAD && 'installing at run time needs Chrome 137+';

test('switched off, then on again: the open scam is closed', () =>
  withBrowser({}, async (browser) => {
    const { id } = await serviceWorker(browser);
    await setExtensionEnabled(browser, id, false);
    const { page, dialogs } = await openPage(browser, `${server.base}/malicious.html`);
    await waitFor(() => isBlob(page), 3000);
    await sleep(800);
    assert.ok(!page.isClosed() && isBlob(page), 'the scam should stay while the extension is off');
    await page.mouse.click(200, 200);
    await setExtensionEnabled(browser, id, true);
    assert.ok(await waitFor(() => page.isClosed(), 8000), 'not rescued after switching on');
    assert.deepEqual(dialogs, []);
  }));

test('installed while the scam is open: it is closed and explained', { skip: NEEDS_INSTALL }, () =>
  withBrowser({ withExtension: false }, async (browser) => {
    const { page, dialogs } = await openPage(browser, `${server.base}/malicious.html`);
    await waitFor(() => isBlob(page), 3000);
    await sleep(800);
    assert.ok(!page.isClosed() && isBlob(page));
    await browser.installExtension(EXTENSION_DIR);
    assert.ok(await waitFor(() => page.isClosed(), 8000), 'not rescued after install');
    assert.equal((await noticePages(browser)).length, 1);
    assert.deepEqual(dialogs, []);
  }),
);

// Worst case for the close chain: every layer active, the user has clicked, and the
// extension arrives late, so the page's capture-phase unload handler outranks ours.
test(
  'installed while the layered scam holds full screen: still closed',
  { skip: NEEDS_INSTALL },
  () =>
    withBrowser({ withExtension: false }, async (browser) => {
      const { page } = await openPage(browser, `${server.base}/samples/malicious-layers.html`);
      await waitFor(() => isBlob(page), 3000);
      await sleep(500);
      await page.mouse.click(200, 200);
      await sleep(700);
      const historyLength = await page.evaluate(() => history.length);
      assert.ok(historyLength > 10, `the layers did not start (history ${historyLength})`);
      await browser.installExtension(EXTENSION_DIR);
      assert.ok(await waitFor(() => page.isClosed(), 10000), 'the layered scam stayed open');
      assert.equal((await noticePages(browser)).length, 1);
    }),
);
