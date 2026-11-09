// Program files a page builds in script are warned about, never deleted by the extension;
// documents and archives draw no notice, even right after a scam or a forged page event.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';

import { SHIELD_EVENTS } from '../src/shared/protocol.ts';
import {
  forgeShieldEvents,
  noticePages,
  noticeText,
  openPage,
  saveDownloadsTo,
  sleep,
  startServer,
  waitFor,
  withBrowser,
} from './harness.ts';

const server = await startServer();
after(() => server.close());

test('a document saved from a blob: URL is kept and draws no notice', () =>
  withBrowser({}, async (browser) => {
    const dir = await saveDownloadsTo(browser);
    const page = await browser.newPage();
    await page.goto(`${server.base}/samples/malicious-download.html`);
    await page.click('#download-report');
    assert.ok(await waitFor(() => existsSync(path.join(dir, 'session-report.pdf')), 5000));
    await sleep(1200);
    assert.equal((await noticePages(browser)).length, 0);
  }));

test('a program saved from a blob: URL is warned about, and deleted only on request', () =>
  withBrowser({}, async (browser) => {
    const dir = await saveDownloadsTo(browser);
    const page = await browser.newPage();
    await page.goto(`${server.base}/samples/malicious-download.html`);
    await page.click('#download');
    const exe = path.join(dir, 'support-tool.exe');
    assert.ok(await waitFor(() => existsSync(exe), 5000), 'the program was not saved');
    const text = await noticeText(browser);
    assert.match(text, /saved a program onto this computer/);
    assert.doesNotMatch(text, /support-tool/i, 'the notice showed a page-chosen file name');
    await sleep(2500);
    assert.ok(existsSync(exe), 'the file was deleted without the user asking');
    assert.equal(page.isClosed(), false);

    const [notice] = await noticePages(browser);
    assert.ok(notice);
    assert.equal(await notice.$eval('#remove', (button) => button.textContent), 'Delete the file');
    await notice.click('#remove');
    assert.ok(await waitFor(() => !existsSync(exe), 5000), 'the button did not delete the file');
    assert.equal(await notice.$eval('#remove', (button) => button.textContent), 'File deleted');
  }));

// The review's proof of concept: a forged event and a real alert period, followed by a
// legitimate app exporting an archive. The archive must survive.
test('an exported archive is kept after a forged event and during an alert period', () =>
  withBrowser({}, async (browser) => {
    const dir = await saveDownloadsTo(browser);
    const hostile = await browser.newPage();
    await hostile.goto(`${server.base}/benign.html`);
    await hostile.evaluate(forgeShieldEvents, Object.values(SHIELD_EVENTS));
    const scam = await openPage(browser, `${server.base}/malicious.html`);
    assert.ok(await waitFor(() => scam.page.isClosed(), 6000), 'setup: the scam was not closed');
    const noticesBefore = (await noticePages(browser)).length;

    const app = await browser.newPage();
    await app.goto(`${server.base}/benign.html`);
    await app.evaluate(() => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob(['PK test archive'], { type: 'application/zip' }));
      link.download = 'my-notes.zip';
      link.click();
    });
    const zip = path.join(dir, 'my-notes.zip');
    assert.ok(await waitFor(() => existsSync(zip), 5000));
    await sleep(4000);
    assert.ok(existsSync(zip), 'the archive was removed');
    assert.equal((await noticePages(browser)).length, noticesBefore);
  }));
