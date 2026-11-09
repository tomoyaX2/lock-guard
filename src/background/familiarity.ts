// Whether the user has a past with a site. Scams arrive through redirects to sites never seen
// before, and unlike wording, a scammer cannot fake the user's own browsing history.

import { debug } from './debug.ts';

// A visit only counts once it is this old, so the visit that led here does not count.
const MIN_VISIT_AGE_MS = 60 * 60_000;
const HISTORY_RESULTS = 100;

/** The web origin behind a URL, including blob: URLs; null for file, data and opaque ones. */
export function originOfUrl(url: string | undefined): string | null {
  try {
    const { origin } = new URL(url ?? '');
    return origin.startsWith('http') ? origin : null;
  } catch {
    return null;
  }
}

/** The search window: only visits made before this moment count as a past with the site. */
export function oldVisitCutoff(now: number): number {
  return now - MIN_VISIT_AGE_MS;
}

/** True when any history entry belongs to exactly this origin (not a look-alike host). */
export function hasPageFrom(entries: readonly { url?: string }[], origin: string): boolean {
  return entries.some((entry) => originOfUrl(entry.url) === origin);
}

/** False when it cannot be known (no origin, history unavailable): absence is not evidence. */
export async function isUnfamiliarSite(origin: string | null): Promise<boolean> {
  if (!origin) {
    return false;
  }
  try {
    // Chrome applies the time range to each visit, so pages opened in the last hour cannot
    // crowd out an old visit: they are simply not in the results.
    const found = await chrome.history.search({
      text: new URL(origin).hostname,
      startTime: 0,
      endTime: oldVisitCutoff(Date.now()),
      maxResults: HISTORY_RESULTS,
    });
    return !hasPageFrom(found, origin);
  } catch (error) {
    debug('history lookup failed', error);
    return false;
  }
}
