// The fixed wording of the notice page for each kind of event. Written here, in the
// extension, so that no page can put its own words under the extension's name.

import type { NoticeKind } from '../shared/protocol.ts';

export interface NoticeCopy {
  title: string;
  lead: string;
  advice: string;
  reasonsHeading: string;
}

export const NOTICE_COPY: Readonly<Record<NoticeKind, NoticeCopy>> = Object.freeze({
  scam: {
    title: 'A scam page was closed',
    lead: 'The page was imitating a system lock screen. Your computer is not locked and nothing on it was changed.',
    advice: 'Do not call any phone number that page showed.',
    reasonsHeading: 'Why it was closed',
  },
  manual: {
    title: 'The page was closed',
    lead: 'You asked Lock Guard to close a page. If it claimed that your computer was locked or infected, that was not true: a web page cannot lock a computer.',
    advice: 'Do not call any phone number that page showed.',
    reasonsHeading: 'Why it was closed',
  },
  download: {
    title: 'A page saved a program onto this computer',
    lead: 'A web page built a program file inside the browser and saved it to your downloads, so it never had a download link that security tools could check. Lock Guard has not touched the file.',
    advice:
      'Do not open it unless you asked for it and trust the site. If you did not expect it, delete it.',
    reasonsHeading: 'Why you are seeing this',
  },
  remote: {
    title: 'Wait before installing remote-control software',
    lead: 'Lock Guard stopped a scam on this computer a few minutes ago, and this site offers a program that lets someone else control your computer.',
    advice:
      'If someone on the phone asked you to install it, hang up. Real support staff never ask for this.',
    reasonsHeading: 'Why you are seeing this',
  },
});
