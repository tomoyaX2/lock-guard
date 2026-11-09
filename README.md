# Lock Guard

A Chrome extension (Manifest V3) that protects against tech-support scams. It closes fake "your computer is locked" pages served from `blob:` URLs and leaves legitimate `blob:` pages working as they do without it. It also warns about two steps such scams lead to: program files built inside a page, and remote-control installs.

The reasoning behind the detection, its false positives and negatives, and browser support are in [docs/DESIGN.md](docs/DESIGN.md).

## Quick start

Requires Node 22.18 or newer, which runs the TypeScript scripts and tests directly.

```sh
npm install
npm run build    # writes the loadable extension to dist/
npm run serve    # test pages at http://localhost:8000/
```

1. In Chrome open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick `dist/`.
2. Open `http://localhost:8000/`. It links each test page with the result to expect.
3. After changing code, run `npm run build` again and click the reload icon on the extension's card.

## How it works

Two scripts load in every top-level page at `document_start` and stop at once unless the page is a `blob:` document. A service worker acts on what they report.

```
page world      shield ──► blob: page? ──no──► stop, nothing in the page is touched
                       └─► yes: reports lock requests and cuts endless dialog runs
                                 │ events
isolated world  content script ──► gate: script-capable blob: page? ──no──► stop
                                 │ yes
                                 ▼
                detector scores behaviour + site familiarity + wording ──► verdict "block"
                                 │ message
service worker  ──► opens a notice page, discards and closes the tab, starts a 30-minute alert
                ──► warns about program files saved from blob: URLs (never deletes them)
                ──► during an alert, warns before remote-control sites
```

- **Shield** (`src/shield/`). This script runs in the page's own world.
  - On ordinary pages it does nothing and leaves no trace, so a site cannot tell that the extension is installed.
  - On `blob:` pages it reports requests for full screen, pointer lock and keyboard lock to the detector, and lets them through. The only thing it stops is a run of dialogs: the sixth one opened back to back throws an error, which gets the page out of `while (true) alert()`.
- **Gate** (`src/content/gate.ts`). Neither script does anything unless the page is a top-level `blob:` document that can run script. On other pages there are no listeners, timers or messages.
- **Detector** (`src/content/`). It scores three kinds of evidence. A page is closed at 100 points with at least one strong trap.
  - **Entrapment:** blocked keys, full screen or pointer lock while it is held, stuffed history, dialog floods, unload and context-menu blocking. Key, menu and unload blocking are measured by sending synthetic events.
  - **Context:** whether the browser has ever visited the site before, whether another scam was just stopped, and whether the page fills the window like an alert.
  - **Wording:** lock phrases, a phone number with a call to action, a vendor name, an error code. Together these are worth 35 points, so text can never decide alone.
- **Neutraliser** (`neutraliser.ts`). These capture listeners are registered at `document_start`. Once a verdict is in, they stop the page's key, menu and unload handlers, so the page cannot block its own closing.
- **Service worker** (`src/background/`).
  - `messages.ts`, `rescue.ts`: trusts only the tab the browser says a message came from, then opens the notice page and discards and closes the scam tab.
  - `familiarity.ts`: answers "has this site been visited before?" from browser history. Nothing is stored.
  - `downloads.ts`: opens a warning when a page on an unfamiliar site builds a program file in script and saves it from a `blob:` or `data:` URL. The file is left alone; the notice has a **Delete the file** button.
  - `alert.ts`, `remote.ts`: for 30 minutes after the detector closes a scam page, a visit to a remote-control tool's site shows a warning first, with a delayed Continue button.
  - `scan.ts`: on install or startup, injects both scripts into `blob:` tabs that were already open.
- **Manual exits.** Alt+Shift+L closes the current page on any site; the browser handles the keys before the page sees them. An ordinary page is closed the way its close button closes it, so unsaved work still gets the browser's "Leave site?" prompt. The toolbar button works on `blob:` pages only, and there a manual close skips that prompt.
- **Notice page** (`src/blocked/`, `public/blocked/`). It explains what happened using fixed sentences only, never text from a web page.
- **Fallback**. If the service worker does not answer, the content script sends the tab to `about:blank` itself.

Weights, thresholds, word lists and timeouts are in `src/content/config.ts`.

### What it never does by itself

A hostile page will try to turn the extension against its user, so the extension limits what it does on its own. `test/safety.test.ts` enforces these limits:

- The service worker never deletes, cancels or erases a download. Only a click on the notice page's button deletes a file.
- Only a detector verdict starts the alert period, and the alert period never affects downloads.
- The shield refuses no full screen or lock request and does not touch history.

## Project layout

| Path                                             | Contents                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `src/shield/`                                    | Page-world script: trap watching on `blob:` pages                                             |
| `src/content/`                                   | Content script: gate, neutraliser, text extraction, probes, scoring, detector                 |
| `src/background/`                                | Service worker: messages, tab rescue, downloads, remote-tool warning, alert, site familiarity |
| `src/blocked/`                                   | Script and fixed wording for the notice page                                                  |
| `src/shared/`                                    | Message types, signal ids and their fixed sentences, shared by all parts                      |
| `public/`                                        | `manifest.json` and the blocked page's HTML and CSS, copied to `dist/` as-is                  |
| `dist/`                                          | Built extension. Generated by `npm run build`; do not edit                                    |
| `scripts/`                                       | `build.ts` (esbuild bundling) and `serve-tests.ts` (local test server)                        |
| `test/`                                          | Unit tests, run by Node straight from TypeScript                                              |
| `e2e/`                                           | Browser tests (Puppeteer, real Chrome with the built extension) and the load-cost measurement |
| `index.html`, `samples/`                         | Start page and extra test pages for manual testing                                            |
| `malicious.html`, `benign.html`, `ASSIGNMENT.md` | Provided with the assignment; kept unchanged                                                  |

The build bundles each entry point (`src/shield/index.ts`, `src/content/index.ts`, `src/background/index.ts`, `src/blocked/blocked.ts`) into one plain script, because Chrome runs neither TypeScript nor `import` in content scripts. The output file names must match `public/manifest.json`.

## Scripts

| Command             | What it does                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`     | Cleans `dist/`, copies `public/`, bundles `src/` with esbuild (target Chrome 134)                                                                    |
| `npm run serve`     | Serves only the test pages on `127.0.0.1:8000`; every other path returns 404. Set `PORT` to change the port                                          |
| `npm test`          | Unit tests for scoring, text handling, evaluation order, the download rule, message validation, the manifest, the safety limits and the comment rule |
| `npm run typecheck` | `tsc` in strict mode for `src/`, then for `test/`, `e2e/` and `scripts/`                                                                             |
| `npm run lint`      | ESLint with type-aware rules, zero warnings allowed                                                                                                  |
| `npm run format`    | Prettier, writing changes (`format:check` only reports)                                                                                              |
| `npm run check`     | All of the above plus the build. Run it before committing                                                                                            |
| `npm run e2e`       | Builds, then runs the browser tests in `e2e/` against Chrome for Testing, each in a fresh profile. Local only: test sites map to `127.0.0.1`         |
| `npm run measure`   | Builds, then times page loads with no extension, the content script alone, and both scripts (5 rounds of 80 loads)                                   |

`npm install` downloads Chrome for Testing for Puppeteer. To test another browser, set `CHROME_PATH` to its executable. Older versions such as Chrome 134 cannot load an extension over DevTools; add `LEGACY_LOAD=1` for them, which skips the four tests this tooling cannot drive there (installing into a running browser, and the shortcut).

## Testing by hand

`http://localhost:8000/` links all of these.

| Page                              | Expected                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `malicious.html`                  | Tab closes; a notice page opens next to it                                                                     |
| `benign.html`                     | After "View Generated Report", the report opens and stays open                                                 |
| `samples/malicious-layers.html`   | Closes, even with its extra traps                                                                              |
| `samples/malicious-delayed.html`  | Left alone at first, closed once it turns into a lock screen                                                   |
| `samples/malicious-image.html`    | Closes although its message is a picture with no text                                                          |
| `samples/benign-editor.html`      | Stays open although it shows scam text and guards its reply                                                    |
| `samples/benign-fullscreen.html`  | Goes full screen as usual and stays open                                                                       |
| `samples/malicious-download.html` | A notice opens with a **Delete the file** button; the `.exe` stays until you press it. The PDF draws no notice |
| `samples/malicious-dialogs.html`  | After five alert boxes the run is cut and the page closes                                                      |

More things to try:

- **Remote-control warning.** After Lock Guard closes one of the lock-screen pages above, open `anydesk.com` within 30 minutes. A warning appears first.
- **Shortcut.** Press Alt+Shift+L on any web page to close it. A page with unsaved work shows the browser's "Leave site?" prompt first. If the keys are taken, set them at `chrome://extensions/shortcuts`.
- **Already-open page.** Turn the extension off, open `malicious.html`, then turn the extension back on. The tab is rescued.

Things to know:

- **Familiarity.** "A site not visited before" means no visit older than one hour in the browser's history. `localhost` counts as unfamiliar the first time you test, and as familiar an hour later. Two results depend on it. Once `localhost` is familiar, `malicious-image.html` is no longer closed and the `.exe` download draws no notice. The other pages behave the same either way: the provided `malicious.html` scores 110 of the 100 needed on a familiar site and 140 on a new one. A new Chrome profile resets this.
- **Chrome version.** Chrome 134 or newer is required; older versions refuse to install the extension.
- **Pages opened from disk.** `file://` pages work only with **Allow access to file URLs** on in the extension's details.

## Permissions

| Permission                | Used for                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `<all_urls>`, `scripting` | Loading the two scripts, which act on `blob:` pages only, and injecting them into `blob:` tabs that were already open |
| `tabs`                    | Reading a tab's URL to confirm it still shows the reported page, and closing it                                       |
| `storage`                 | Session-only records for the notice page and the alert period                                                         |
| `history`                 | Checking whether a site was visited before. Read on demand; nothing is copied or sent                                 |
| `downloads`               | Noticing program files saved from `blob:` or `data:` URLs, and deleting one when the user presses the notice's button |
| `webNavigation`           | Waking the worker for remote-control sites only, by host filter                                                       |

The extension makes no network requests. On install Chrome lists what these allow: reading and changing data on all sites, reading and changing browsing history, and managing downloads.

## Debugging

- **Content script.** Open DevTools on the `blob:` page and pick the **Lock Guard** context in the console's context menu. There, `LockGuard.evaluate()` returns the current signals, score and verdict. It only exists on pages that pass the gate.
- **Service worker.** Click **service worker** on the extension's card in `chrome://extensions`. Logging is off by default; set `DEBUG = true` in `src/background/debug.ts` and rebuild.
- **Stored state.** Session records (signal ids, a count, a time, no page content) are visible with `chrome.storage.session.get()` in the service worker console.

## Code rules

Enforced by `npm run check`, not by review:

- Prettier formatting; strict TypeScript.
- Files of at most 200 lines and functions of at most 40.
- Comments of at most two lines.
- No HTML sinks such as `innerHTML`.
- No `console` outside `debug.ts`.
