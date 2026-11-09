# Lock Guard design note

How Lock Guard tells a scam lock screen from a legitimate `blob:` page, how it gets the user out, what else it warns about, and where it can be wrong. For setup and project layout, see the [README](../README.md).

## Summary

The lock screen is only the bait. The damage comes afterwards: the victim phones the number, installs a remote-control tool or runs a file, and pays. Lock Guard does three things, in this order of importance.

1. **Detect and close.** A `blob:` page is scored on what it does, where it comes from and, least of all, what it says. At 100 points with at least one strong trap, the tab is discarded and closed and a notice page explains why.
2. **Watch without breaking.** On `blob:` pages a second script tells the detector when a page asks for full screen or a lock, so it looks again, and cuts short an endless run of alert boxes. Nothing else changes, so a legitimate `blob:` page behaves as it does without the extension.
3. **Warn about what follows.** A program file built in script and saved from a `blob:` URL draws a warning. For 30 minutes after a scam page is closed, remote-control sites show a warning first.

Closing a page it judged to be a scam is the only thing Lock Guard does on its own that cannot be undone. It deletes no file, refuses no full-screen request and blocks no site for good.

The main false positives are kiosk or exam pages that lock the browser on purpose. The main false negatives are scams on a site the user has visited before that show their message as an image and use few traps, and scams that are not on `blob:` pages at all.

## How the attack is detected

Both provided samples use the same mechanism, an HTML document at a `blob:` URL, so the URL cannot decide anything. It is only the gate: the detector works solely in a top-level `blob:` document that can run script.

Inside such a document three kinds of evidence are scored:

| Kind       | Signal                                                                  | Weight |
| ---------- | ----------------------------------------------------------------------- | ------ |
| Entrapment | cancels refresh / close / devtools keys (**strong**)                    | 30     |
| Entrapment | holds full screen or pointer lock, counted only while held (**strong**) | 30     |
| Entrapment | stuffs the tab history (**strong**)                                     | 25     |
| Entrapment | opens more than five alert boxes back to back (**strong**)              | 20     |
| Entrapment | cancels `beforeunload`                                                  | 25     |
| Entrapment | cancels the context menu                                                | 10     |
| Context    | the browser has never visited the site that produced the page           | 30     |
| Context    | another scam was stopped minutes ago                                    | 15     |
| Context    | fills the window like a system alert                                    | 10     |
| Wording    | lock / threat phrase                                                    | 15     |
| Wording    | phone number next to a call to action                                   | 10     |
| Wording    | operating-system vendor name                                            | 5      |
| Wording    | fake error code                                                         | 5      |

**A page is closed when the total reaches 100 and at least one strong trap is present.**

Why this shape:

- **Behaviour over wording.** Text is the easiest thing for a scammer to change: translate it, put it in an image, split the letters. All wording together is worth 35 points. A lock screen whose message is a picture (`samples/malicious-image.html`) is still closed.
- **History the scammer cannot fake.** Scams arrive through redirects to sites the user has never seen, while the apps people use in full screen are ones they return to. "Unfamiliar" means no visit older than one hour, so the visit that led to the scam does not count.
- **Unload guards and custom context menus are everyday app behaviour**, so they add weight but cannot carry a verdict. This protects a legitimate app that displays hostile text, for example a mail client previewing a scam email (`samples/benign-editor.html`).
- **Entrapment is measured, not guessed.** The detector dispatches synthetic key, context-menu and unload events and reads whether the page cancelled them. This also sees handlers registered before the extension was installed.
- **Probes run only when they could change the outcome.** `benign.html` receives no synthetic event at all.
- **How the page was reached is ignored.** Auto-redirect versus click is cheap for an attacker to change, and unknown when the extension is installed after the page loaded.

The page is re-checked when its content changes, on user input, and when the shield reports something. A change on a quiet page is checked 100 ms later; a page that keeps changing, at most every two seconds. A lock screen that appears late or after the first click is still caught.

The history signal makes one result depend on the browser: the same page can be closed in a profile that has never seen the site and left open in one that has. The provided `malicious.html` does not depend on it. It scores 110 on a familiar site and 140 on a new one.

## The shield: watching without breaking

A second script runs in the page's own JavaScript world. On `blob:` pages it does two things:

- **Lock requests are reported, then let through.** `requestFullscreen`, `requestPointerLock` and `navigator.keyboard.lock` work as usual. A request makes the detector look again, but only a lock that is actually held counts, and only while it is held. A request the browser refused traps nobody, and a slideshow that left full screen is not marked for the rest of its life.
- **An endless run of dialogs is cut.** A dialog that opens within a second of the previous one closing was not asked for by the user. The sixth in such a run throws an error instead of opening. The error is what gets a page out of `while (true) alert()`, so the tab does not hang and the detector can run (`samples/malicious-dialogs.html`).

The first version of the shield went further: it refused full screen and locks on every `blob:` page and capped history entries and dialogs at three. Review showed that this broke the assignment's rule that a legitimate page must behave normally. A slideshow lost its full-screen button, and a fourth `confirm()` silently answered "Cancel". It was removed. A scam that takes full screen is closed about a second later by the detector instead (`samples/benign-fullscreen.html` is the legitimate counterpart).

Unload prompts are not removed. They are how real apps protect unsaved work, and the browser already gives the user a Leave button.

## How the page is stopped

The trapped tab is **replaced**: a notice page opens next to it, then the tab is discarded and closed. Discarding drops the document without running its unload handlers, so no "Leave site?" prompt can hold the user. Navigating the same tab instead would leave the scam one Back press away. The price is that the tab's earlier history is lost.

Two manual exits cover anything detection misses:

- **Alt+Shift+L** closes the current page on any site. The browser handles the shortcut before the page sees the keys. An ordinary page is closed the way its close button closes it, so a page guarding unsaved work still gets the browser's "Leave site?" prompt and an accidental press loses nothing.
- **The toolbar button** works on `blob:` pages only, because it is easy to click by accident. There a manual close skips the page's unload prompt, since that is where the detector's misses are.

A manual close does not start the alert period.

## Warning about what follows

- **Smuggled downloads.** A page can assemble a file in script and save it from a `blob:` or `data:` URL, so there is never a download link for a scanner to check. When such a file is a program type (`.exe`, `.msi`, `.js`, `.iso` and similar) and the site is unfamiliar, a notice opens beside the page. Lock Guard does not touch the file. The notice has a **Delete the file** button, and only that click deletes it. Documents and archives never draw a notice.
- **The alert period.** For 30 minutes after the detector closes a scam page, other `blob:` pages are scored more strictly, and a visit to a remote-control tool's site (AnyDesk, TeamViewer and 13 others) shows a warning with a Continue button that unlocks after 10 seconds.

Why downloads are not deleted automatically, as they were in the first version: "unfamiliar" covers the first hour on any new site, so a script exported from a new web editor would have been destroyed. And a rule that deletes files is a rule an attacker can try to aim at someone else's files.

## False positives and false negatives

False positives (a legitimate page affected):

- A `blob:`-hosted app on a site never visited before that cancels refresh and close keys, guards unload and fills the window is closed even without scam wording. Kiosk and exam lock-down pages fit this.
- Phishing-awareness simulations, which are built to look like the real thing.
- A `blob:` page that opens more than five dialogs back to back has the sixth fail with an error.
- A site that hands out a program through a `blob:` download draws a warning on the first visit. The file is untouched.
- Users who clear their history, or use a fresh profile, have no familiar sites, so every site counts as new.

False negatives (a threat left alone):

- A scam on a familiar site whose message is an image and which uses neither full screen, history stuffing nor dialogs.
- Handlers that ignore synthetic events (`event.isTrusted`). Full screen, locks, history stuffing and dialog floods are still seen.
- Scams with only soft traps. The user can still leave those.
- Scams that are not on `blob:` pages. The detector does not run there; the shortcut, the download warning and the alert period do.
- A dialog loop wrapped in `try`/`catch` keeps the tab busy after the run is cut. The browser's "page unresponsive" prompt is the way out, as it is without the extension.
- Dialogs opened more than a second apart are not counted as a run.
- Paste-and-run scams ("ClickFix"), where a fake captcha copies a command for the victim to paste into the Run box. Nothing here looks at the clipboard; see the end of this note.
- A smuggled archive, or a smuggled program on a familiar site, draws no warning.
- A scam inside an iframe.

There is no "show the page anyway" button. A scam page could coach the user to press it.

## Abuse resistance

A hostile page will try to turn the extension against its user, so the extension limits what it does on its own. `test/safety.test.ts` checks these limits against the source:

- **No automatic file deletion.** The service worker never deletes, cancels or erases a download. Only the user's click on the notice page deletes a file.
- **One trigger for the alert period.** Only a detector verdict starts it, and it never affects downloads.
- **The shield refuses nothing.** No full-screen or lock request is refused, and history is left alone.

The first version broke the first two limits. A page could forge an event that started an alert period, during which archives saved from `blob:` URLs were deleted on every site. Review proved it with a zip exported by an unrelated site. The same proof of concept now leaves the file in place.

What remains:

- A `blob:` page can forge the shield's two events. That raises only its own score. On ordinary pages nothing listens for them.
- A page can start an alert period on purpose, by being a scam page and getting closed. That buys it stricter scoring of `blob:` pages and a delayed warning in front of 15 remote-control sites for 30 minutes.
- The service worker acts only on the tab the browser says a message came from, re-checks that the tab still shows the reported document, and ignores scam reports that are not from its own content script in a `blob:` top frame.
- Notice pages print fixed sentences only. Nothing from a web page (title, text, phone number, file name) can appear under the extension's name.
- Nothing is web-accessible, so pages cannot load or frame the extension's pages.
- One notice page per window, so a page that keeps misbehaving cannot make the extension spawn tabs.
- No network requests. Browser history is read on demand and never stored. Session storage holds signal ids, a count, a time and a download id.

What a hostile page can learn: on a `blob:` page the wrapped functions and the probe events are visible, so that page can tell Lock Guard is installed. An ordinary page cannot: nothing is wrapped or added there.

## Cost

Both scripts load on every page and return at the gate: no listeners, timers, wrapped functions or messages. On `blob:` pages only, the detector adds its observers and probes, all rate-limited. The service worker is woken by scam reports, downloads changing state, and navigations to the listed remote-control hosts, not by ordinary browsing.

`npm run measure` times five rounds of 80 loads of a small local page on Chrome 156. In the latest run the median load time averaged 14.3 ms without the extension and 16.2 ms with it, whether or not the shield was included. That is about 2 ms per page (an earlier run on the same machine gave 1.3 ms), nearly all of it the fixed price of having a content script at all. The shield's own cost is too small to measure.

## Permissions

| Permission                | Why                                                           | What Chrome tells the user on install         |
| ------------------------- | ------------------------------------------------------------- | --------------------------------------------- |
| `<all_urls>`, `scripting` | The two scripts, and injection into already-open `blob:` tabs | Read and change all your data on all websites |
| `tabs`, `webNavigation`   | Confirming and closing a tab; waking for remote-control hosts | Read your browsing history                    |
| `history`                 | The visited-before signal                                     | Read and change your browsing history         |
| `downloads`               | The download warning and its Delete button                    | Manage your downloads                         |
| `storage`                 | Session records for the notice page and the alert period      | Nothing                                       |

The assignment needs only the first two rows and `storage`. The `history` and `downloads` warnings are the price of the visited-before signal and the download warning.

## Browser support

| Browser                              | Status                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| Chrome 156 (current)                 | All 24 browser tests in `e2e/` pass (`npm run e2e`)                                 |
| Microsoft Edge 157                   | All 24 pass; one earlier run had two timing failures that did not recur             |
| Chrome 134 (minimum)                 | The 20 tests that can run there pass; 4 cannot be automated on that version (below) |
| Chrome 119 to 133                    | Refuse to install it (see below)                                                    |
| Other Chromium browsers (Brave etc.) | Expected to work from Chromium 134; not tested                                      |
| Firefox, Safari                      | Not supported                                                                       |

On Chrome 134 the test tool can neither install the extension into a running browser (2 tests for pages that were already open) nor run code in the service worker (2 shortcut tests). Run them there with `LEGACY_LOAD=1 CHROME_PATH=<chrome.exe> npm run e2e`.

The manifest sets `minimum_chrome_version` to 134. Pages that were already open when the extension is installed are handled by injecting the scripts into existing `blob:` tabs. Trying that injection by hand on each Chrome for Testing build showed that 133 refuses it and 134 allows it; that bisection is not part of the test suite.

Not tested in a browser:

- **Pressing Alt+Shift+L.** Automation cannot press extension shortcuts. The tests fire the shortcut's event inside the service worker instead.
- **The Continue button's navigation.**
- **Behaviour on a familiar site.** Every browser test starts from a fresh profile; unit tests cover the familiar case.

## Related techniques (not implemented)

The same scorer and shield apply to any document that has no scannable network URL. The gate would widen from "top-level `blob:`" to: `data:` and `filesystem:` documents, `about:blank` or `srcdoc` frames filled by script, an iframe of any of these that covers the viewport, and a normal URL whose content is rewritten in place with `document.write`. That needs `all_frames: true` and a check that the frame covers most of the window.

The larger step is ordinary `https://` lock screens, which are the majority in the wild. The detector could start there when a page enters full screen or locks the keyboard, which costs nothing until it happens; the visited-before signal would decide.

A clipboard screen for paste-and-run scams was built and then removed. It has to wrap the clipboard functions of every website, which costs load time and lets any site detect the extension. And a script cannot know what the user actually sees, so its "is this command shown on the page?" test was either easy to dodge with tiny text or raised false alarms on documentation sites. Done properly it belongs in the browser, at paste time.
