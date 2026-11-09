// Test-page server for `npm run serve` (PORT overrides 8000): serves only the pages below, on
// 127.0.0.1 only. Every other path, including source and node_modules, gets a 404.

import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const HOST = '127.0.0.1';
const PORT = Number(process.env['PORT']) || 8000;

// URL path → file inside the project. Nothing outside this map is reachable.
const ROUTES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/malicious.html', 'malicious.html'],
  ['/benign.html', 'benign.html'],
  ['/samples/malicious-layers.html', 'samples/malicious-layers.html'],
  ['/samples/malicious-delayed.html', 'samples/malicious-delayed.html'],
  ['/samples/benign-editor.html', 'samples/benign-editor.html'],
  ['/samples/malicious-image.html', 'samples/malicious-image.html'],
  ['/samples/benign-fullscreen.html', 'samples/benign-fullscreen.html'],
  ['/samples/malicious-download.html', 'samples/malicious-download.html'],
  ['/samples/malicious-dialogs.html', 'samples/malicious-dialogs.html'],
]);

const HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function reply(res: http.ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(message);
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    reply(res, 405, 'Method not allowed');
    return;
  }
  // Only the path is matched; query strings such as ?delay=3 are left for the page.
  const { pathname } = new URL(req.url ?? '/', `http://${HOST}`);
  const file = ROUTES.get(pathname);
  if (!file) {
    reply(res, 404, 'Not found');
    return;
  }
  try {
    const body = await readFile(path.join(ROOT, file));
    res.writeHead(200, HEADERS);
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    reply(res, 500, 'Could not read the page');
  }
}

http
  .createServer((req, res) => {
    void handle(req, res);
  })
  .listen(PORT, HOST, () => {
    process.stdout.write(`Test pages at http://localhost:${PORT}/\n`);
  });
