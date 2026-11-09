// The high-alert period that follows anything Lock Guard stops. A frightened user often walks
// into the next step of the scam, so for a while risky actions get a second look.

import { ALERT_UNTIL_KEY, REMOTE_ALLOWED_KEY } from '../shared/protocol.ts';

const ALERT_MS = 30 * 60_000;

/** Starts or extends the period, and withdraws any earlier "continue" for remote tools. */
export async function startAlert(): Promise<void> {
  await chrome.storage.session.set({
    [ALERT_UNTIL_KEY]: Date.now() + ALERT_MS,
    [REMOTE_ALLOWED_KEY]: false,
  });
}

export async function isAlertActive(): Promise<boolean> {
  try {
    const stored: Record<string, unknown> = await chrome.storage.session.get(ALERT_UNTIL_KEY);
    const until = stored[ALERT_UNTIL_KEY];
    return typeof until === 'number' && Date.now() < until;
  } catch {
    // Storage unavailable: behave as on a normal day rather than block on a guess.
    return false;
  }
}

/** True once the user chose to continue to a remote-control site during this alert. */
export async function isRemoteAllowed(): Promise<boolean> {
  const stored: Record<string, unknown> = await chrome.storage.session.get(REMOTE_ALLOWED_KEY);
  return stored[REMOTE_ALLOWED_KEY] === true;
}
