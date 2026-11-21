import { useSyncExternalStore } from 'react';

const NARROW = '(max-width: 767.98px)';
/** The top bar's middle width (tablets, narrow laptop windows); see TopBar. */
const COMPACT = '(max-width: 1179.98px)';

const subscribers = new Map<string, (cb: () => void) => () => void>();

function subscriberOf(query: string): (cb: () => void) => () => void {
  let s = subscribers.get(query);
  if (!s) {
    s = (cb) => {
      const m = matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    };
    subscribers.set(query, s);
  }
  return s;
}

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    subscriberOf(query),
    () => matchMedia(query).matches,
    () => false,
  );
}

/** Below 768 px: mobile layout (tabs, overflow menu). */
export function useNarrow(): boolean {
  return useMedia(NARROW);
}

/** Below 1180 px: the top bar moves its less used commands into a ⋯ menu. */
export function useCompactTopbar(): boolean {
  return useMedia(COMPACT);
}
