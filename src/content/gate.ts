// Decides whether this document is one the detector looks at: a top-level blob: page that can
// run script. PDFs, images and media previews never pass.

const SCRIPT_CAPABLE_TYPES: readonly string[] = [
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'text/xml',
  'application/xml',
];

/** The protocol test comes first: it is the only work done on an ordinary page. */
export function isGuardedDocument(): boolean {
  return (
    location.protocol === 'blob:' &&
    window.top === window &&
    SCRIPT_CAPABLE_TYPES.includes(document.contentType)
  );
}
