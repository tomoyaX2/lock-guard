// Pure decisions made by the service worker: which downloads to warn about, which sites count
// as remote-control tools, and what makes a site familiar.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isProgramFile, shouldWarnAboutDownload } from '../src/background/downloads.ts';
import { hasPageFrom, oldVisitCutoff, originOfUrl } from '../src/background/familiarity.ts';
import { REMOTE_TOOL_HOSTS, remoteToolHost } from '../src/background/remote.ts';

const HOUR = 60 * 60_000;
const BLOB_URL = 'blob:https://example.com/3f0c';

test('program files are told by the last extension, in any case', () => {
  assert.equal(isProgramFile('C:\\Users\\me\\Downloads\\Support-Tool.EXE'), true);
  assert.equal(isProgramFile('invoice.pdf.js'), true);
  assert.equal(isProgramFile('photos.zip'), false);
  assert.equal(isProgramFile('report.pdf'), false);
  assert.equal(isProgramFile('README'), false);
});

test('a program built in the page draws a warning when the site is unfamiliar', () => {
  const facts = { url: BLOB_URL, filename: 'tool.exe', unfamiliarSite: true };
  assert.equal(shouldWarnAboutDownload(facts), true);
  assert.equal(
    shouldWarnAboutDownload({ ...facts, url: 'data:application/octet-stream,MZ' }),
    true,
  );
});

test('the same program from a familiar site, or from a real link, draws none', () => {
  const familiar = { url: BLOB_URL, filename: 'tool.exe', unfamiliarSite: false };
  assert.equal(shouldWarnAboutDownload(familiar), false);
  const linked = { url: 'https://example.com/tool.exe', filename: 'tool.exe' };
  assert.equal(shouldWarnAboutDownload({ ...linked, unfamiliarSite: true }), false);
});

test('documents and archives never draw a warning', () => {
  const unfamiliar = { unfamiliarSite: true, url: BLOB_URL };
  assert.equal(shouldWarnAboutDownload({ ...unfamiliar, filename: 'report.pdf' }), false);
  assert.equal(shouldWarnAboutDownload({ ...unfamiliar, filename: 'my-notes.zip' }), false);
});

// The rule takes no input a page can switch on, so no page can widen it for another site.
test('the download rule depends only on the file and on the site it came from', () => {
  assert.equal(shouldWarnAboutDownload.length, 1);
  const facts = { url: BLOB_URL, filename: 'my-notes.zip', unfamiliarSite: false };
  assert.equal(shouldWarnAboutDownload({ ...facts, alertActive: true } as typeof facts), false);
});

test('remote-control sites are matched by exact host or subdomain only', () => {
  assert.equal(remoteToolHost('https://anydesk.com/en/downloads'), 'anydesk.com');
  assert.equal(remoteToolHost('https://download.teamviewer.com/x'), 'teamviewer.com');
  assert.equal(remoteToolHost('https://notanydesk.com/'), null);
  assert.equal(remoteToolHost('https://anydesk.com.evil.example/'), null);
  assert.equal(remoteToolHost('https://example.com/?next=anydesk.com'), null);
  assert.equal(remoteToolHost('not a url'), null);
});

test('every listed remote-control host is a bare lower-case host name', () => {
  for (const host of REMOTE_TOOL_HOSTS) {
    assert.match(host, /^[a-z0-9.-]+\.[a-z]+$/);
  }
});

test('the site behind a blob: URL is its creator; file and data URLs have none', () => {
  assert.equal(originOfUrl('blob:https://example.com/3f0c'), 'https://example.com');
  assert.equal(originOfUrl('https://example.com:8443/a?b#c'), 'https://example.com:8443');
  assert.equal(originOfUrl('blob:null/3f0c'), null);
  assert.equal(originOfUrl('data:text/html,hi'), null);
  assert.equal(originOfUrl(undefined), null);
});

test('only visits older than an hour are searched', () => {
  const now = Date.UTC(2026, 10, 9, 12);
  assert.equal(oldVisitCutoff(now), now - HOUR);
});

test('a past with the site means a page from exactly that origin', () => {
  const origin = 'https://mail.example.com';
  const entries = [{ url: 'https://evil-mail.example.com.attacker.net/x' }, {}];
  assert.equal(hasPageFrom(entries, origin), false);
  assert.equal(hasPageFrom([...entries, { url: `${origin}/inbox?id=7` }], origin), true);
  assert.equal(hasPageFrom([{ url: 'http://mail.example.com/' }], origin), false);
});
