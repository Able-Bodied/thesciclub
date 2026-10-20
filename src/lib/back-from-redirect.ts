import { useCallback, useEffect, useRef } from 'react';

/** How long a trip may take before the button is given back anyway. */
export const GIVE_BACK_AFTER_MS = 10_000;

/**
 * For a button that sends the page to Google or Apple.
 *
 * On an iPhone's Home Screen the provider opens in a browser over the app, and
 * closing it leaves this page where it was, never unloaded: a button turned
 * off for the trip stayed off until the app was restarted (the owner,
 * 2026-10-20). Call the returned `leave()` on the way out; `onBack` runs once
 * the page is looked at again (visible, focused, or shown from the
 * back-forward cache), or after ten seconds if iOS says nothing.
 */
export function useBackFromRedirect(onBack: () => void): () => void {
  const away = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onBack);
  useEffect(() => {
    latest.current = onBack;
  });

  const back = useCallback(() => {
    if (!away.current) return;
    away.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    latest.current();
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') back();
    };
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) back();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', back);
    window.addEventListener('pageshow', onShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', back);
      window.removeEventListener('pageshow', onShow);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [back]);

  return useCallback(() => {
    away.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(back, GIVE_BACK_AFTER_MS);
  }, [back]);
}
