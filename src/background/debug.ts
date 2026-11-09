// The only place the extension may log. Off by default so that URLs and failure details of
// the pages a user visits never end up in a console by accident.

const DEBUG = false;

export function debug(...details: unknown[]): void {
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.debug('[Lock Guard]', ...details);
  }
}
