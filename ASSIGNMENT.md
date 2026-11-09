# Candidate Assignment

## User Request

We're seeing reports of scam pages that make it look like the user's computer has been locked by Windows/macOS, pressuring them to call a fake support number. The page is able to display this fake lock screen without ever navigating to an external, scannable URL. We need an extension that detects when a tab is showing this kind of content and stops it before the user is trapped. This detection technique should not affect the user's performance as he browses the web.

## Acceptance

An extension is created (Chrome, Manifest V3) that:

- Runs as a content script + background service worker, loadable unpacked via `chrome://extensions`
- Detects when the active tab is displaying a scam "lock screen" of the kind described above
  - Keep in mind, the underlying mechanism the page uses to display this content has legitimate, everyday uses too (e.g. in-browser file previews). Your heuristic needs to tell a malicious use apart from a legitimate one.
  - Also keep in mind, the page may try to block the usual ways a user would escape (right-click, keyboard shortcuts, standard navigation)
- If a scam lock screen is detected
  - Stop it — e.g., navigate the tab away from the page, or otherwise ensure the user can actually leave
- Else (a legitimate use of the same underlying mechanism)
  - Takes no action — the page must behave normally

## Notes

- Two sample pages are provided in `samples/`:
  - `malicious.html` — simulates the attack described above
  - `benign.html` — a legitimate use case relying on the same underlying browser mechanism, and must not be affected
- Only the single active tab needs to be considered — no cross-tab or persistent state is required
- Assume the user may already be on the malicious page when the extension is installed, as well as arriving at it fresh
- No backend, telemetry, or reporting is required — this is a client-side detection/response problem
- JavaScript or TypeScript is the expected language; standard WebExtension APIs (Manifest V3) should be used
- You will have several hours, and are welcome to use AI assistance — we're interested in your judgment on detection heuristics and tradeoffs, not just working code
- Please include a short written note (a few sentences is fine) describing how you detected the attack, why you chose that approach, and its known false-positive / false-negative risks (or if in person describe your reasoning)

## Extra Bonus Points (not required)

- Handle the case where the page adds a further layer of trapping on top of the base technique
- Briefly describe (no need to implement) how you'd extend detection to catch related techniques for displaying deceptive content without a normal, scannable URL
