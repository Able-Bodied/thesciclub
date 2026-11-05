/**
 * One "the member is back" signal for the page shown again and the window
 * focused again. A return usually fires both; listeners hear it once.
 */
const SAME_RETURN_MS = 1000;

const listeners = new Set<() => void>();
let lastReturn = Number.NEGATIVE_INFINITY;

/** True while the tab or the app is in the background. */
export function pageHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function back() {
  if (pageHidden()) return;
  const now = Date.now();
  if (now - lastReturn < SAME_RETURN_MS) return;
  lastReturn = now;
  for (const listener of [...listeners]) listener();
}

function onVisibility() {
  if (!pageHidden()) back();
}

/** Calls `listener` on each return; returns the way to stop. */
export function onPageReturn(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', back);
  }
  return () => {
    if (!listeners.delete(listener) || listeners.size > 0) return;
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', back);
  };
}

/** For tests: the next event is a new return. */
export function resetPageReturnForTest(): void {
  lastReturn = Number.NEGATIVE_INFINITY;
}
