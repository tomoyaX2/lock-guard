// How the page-world shield tells the content script what it stopped: a bare event on
// `document`. The natives are captured now, before any page script can replace them.

const dispatch = document.dispatchEvent.bind(document);
const NativeEvent = Event;

export function report(eventName: string): void {
  dispatch(new NativeEvent(eventName));
}

/** Replaces a method if the browser has it. Returns the original, or undefined if absent. */
export function override(
  target: object,
  name: string,
  replacement: (this: unknown, ...args: unknown[]) => unknown,
): ((...args: unknown[]) => unknown) | undefined {
  const original: unknown = Reflect.get(target, name);
  if (typeof original !== 'function') {
    return undefined;
  }
  Object.defineProperty(target, name, { value: replacement, configurable: true, writable: true });
  return original as (...args: unknown[]) => unknown;
}
