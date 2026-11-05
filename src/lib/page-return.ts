/**
 * One "the member is back" signal for the page shown again and the window
 * focused again. A return usually fires both; listeners hear it once.
 *
 * A screen's catch-up on return (a conversation's or topic's read, and the
 * read mark it sends) holds the return open (holdReturn); what should count
 * after it, like the badges, waits for that (onReturnSettled).
 */
const SAME_RETURN_MS = 1000;
/** A held read that never answers holds the return no longer than this. */
export const RETURN_WAIT_MS = 5000;

const listeners = new Set<() => void>();
const settledListeners = new Set<(held: boolean) => void>();
let lastReturn = Number.NEGATIVE_INFINITY;
// True while the return's listeners run.
let returning = false;
// Reads the return waits for, and whether this return had any.
let open = new Set<symbol>();
let held = false;

/** True while the tab or the app is in the background. */
export function pageHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function settle() {
  const wasHeld = held;
  held = false;
  for (const listener of [...settledListeners]) listener(wasHeld);
}

function back() {
  if (pageHidden()) return;
  const now = Date.now();
  if (now - lastReturn < SAME_RETURN_MS) return;
  lastReturn = now;
  returning = true;
  try {
    for (const listener of [...listeners]) listener();
  } finally {
    returning = false;
  }
  if (open.size === 0) settle();
}

function onVisibility() {
  if (!pageHidden()) back();
}

function hear() {
  if (listeners.size + settledListeners.size !== 1) return;
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', back);
}

function unhear() {
  if (listeners.size + settledListeners.size > 0) return;
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('focus', back);
}

/** Calls `listener` on each return; returns the way to stop. */
export function onPageReturn(listener: () => void): () => void {
  listeners.add(listener);
  hear();
  return () => {
    if (listeners.delete(listener)) unhear();
  };
}

/**
 * Calls `listener` once per return, after the reads it set off have landed.
 * `held`: some screen held it (holdReturn), so a read mark may have gone.
 */
export function onReturnSettled(listener: (held: boolean) => void): () => void {
  settledListeners.add(listener);
  hear();
  return () => {
    if (settledListeners.delete(listener)) unhear();
  };
}

/** A read set off by a return, or by a read it held: the return waits for it. */
export function holdReturn(read: PromiseLike<unknown>): void {
  if (!returning && open.size === 0) return;
  const token = Symbol('read');
  const holds = open;
  holds.add(token);
  held = true;
  const end = () => {
    clearTimeout(giveUp);
    if (!holds.delete(token) || holds.size > 0 || holds !== open || returning) return;
    settle();
  };
  const giveUp = setTimeout(end, RETURN_WAIT_MS);
  read.then(end, end);
}

/** A return's reads are still landing. */
export function returnPending(): boolean {
  return returning || open.size > 0;
}

/** For tests: the next event is a new return. */
export function resetPageReturnForTest(): void {
  lastReturn = Number.NEGATIVE_INFINITY;
  open = new Set();
  held = false;
  returning = false;
}
