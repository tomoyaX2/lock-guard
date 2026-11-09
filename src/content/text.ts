// Bounded text extraction and normalisation. Walks text nodes instead of reading innerText,
// so it never forces layout, and stops at fixed caps so a huge page costs a fixed amount.

import { CONFIG } from './config.ts';

export interface PageText {
  /** Normalised: see normalise(). */
  text: string;
  hasTelLink: boolean;
}

const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
// Soft hyphen, zero-width space/joiners, word joiner, BOM: used to split words invisibly.
const INVISIBLE_CHARACTERS = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;

export function normalise(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(INVISIBLE_CHARACTERS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isReadable(node: Node): boolean {
  const parent = node.parentElement;
  return !parent || !SKIPPED_TAGS.has(parent.tagName.toUpperCase());
}

export function collectPageText(): PageText {
  const parts = [document.title];
  let length = document.title.length;
  const root = document.documentElement;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let visited = 0;
  while (length < CONFIG.TEXT_LIMIT_CHARS && visited < CONFIG.TEXT_NODE_LIMIT) {
    const node = walker.nextNode();
    if (!node) {
      break;
    }
    visited += 1;
    if (isReadable(node)) {
      const value = node.nodeValue ?? '';
      parts.push(value);
      length += value.length;
    }
  }
  return {
    text: normalise(parts.join(' ').slice(0, CONFIG.TEXT_LIMIT_CHARS)),
    hasTelLink: document.querySelector('a[href^="tel:" i]') !== null,
  };
}
