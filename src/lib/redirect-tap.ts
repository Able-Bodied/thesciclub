import { useCallback, useRef } from 'react';

/** A second tap this soon after the first is the same tap. */
export const TAP_AGAIN_AFTER_MS = 2000;

/**
 * For a button that sends the page to Google or Apple: true when this tap
 * should go, false for a second tap straight after the first.
 *
 * Not a button turned off for the trip. On an iPhone's Home Screen the
 * provider opens over the app, and closing it leaves this page as it was with
 * nothing to say so: no focus, no visibility change, and timers held. A button
 * turned off stayed off until the app restarted (the owner, 2026-10-20). The
 * clock is read at the tap, so nothing has to happen in between.
 */
export function useRedirectTap(now: () => number = Date.now): () => boolean {
  const last = useRef(Number.NEGATIVE_INFINITY);
  return useCallback(() => {
    const at = now();
    if (at - last.current < TAP_AGAIN_AFTER_MS) return false;
    last.current = at;
    return true;
  }, [now]);
}
