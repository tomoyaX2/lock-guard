// Signal ids and the fixed sentence shown for each. Notice pages print only these sentences,
// so nothing taken from a web page can appear under the extension's name.

export const SCORED_SIGNALS = [
  'keysBlocked',
  'lockHeld',
  'historyStuffed',
  'dialogFlood',
  'unloadBlocked',
  'contextMenuBlocked',
  'alertLayout',
  'unfamiliarSite',
  'recentBlock',
  'threatPhrase',
  'phoneCallToAction',
  'brand',
  'errorCode',
] as const;

export type ScoredSignal = (typeof SCORED_SIGNALS)[number];

/** Reasons that explain a notice but are never part of a page's score. */
export const NOTICE_SIGNALS = ['manual', 'riskyDownload', 'remoteTool'] as const;

export type NoticeSignal = (typeof NOTICE_SIGNALS)[number];
export const MANUAL_SIGNAL = 'manual';
export type SignalId = ScoredSignal | NoticeSignal;

export const SIGNAL_LABELS: Readonly<Record<SignalId, string>> = Object.freeze({
  keysBlocked: 'It blocked the keys used to refresh or close a page.',
  lockHeld: 'It took over the screen in full screen mode or captured the mouse pointer.',
  historyStuffed: 'It filled the tab history so that Back would not leave it.',
  dialogFlood: 'It opened alert boxes one after another without a pause.',
  unloadBlocked: 'It tried to stop the tab from closing.',
  contextMenuBlocked: 'It disabled the right-click menu.',
  alertLayout: 'It filled the whole window like a system alert.',
  unfamiliarSite: 'It came from a site this browser had not visited before.',
  recentBlock: 'Another scam was stopped on this computer a few minutes earlier.',
  threatPhrase: 'It claimed the computer was locked, infected or at risk.',
  phoneCallToAction: 'It urged you to phone a support number.',
  brand: 'It used the name of an operating system vendor.',
  errorCode: 'It showed a technical-looking error code.',
  manual: 'You asked Lock Guard to close it.',
  riskyDownload: 'A page built a program file in the browser and saved it to this computer.',
  remoteTool: 'This site offers software that lets someone else control your computer.',
});

export function isScoredSignal(value: unknown): value is ScoredSignal {
  return typeof value === 'string' && (SCORED_SIGNALS as readonly string[]).includes(value);
}
