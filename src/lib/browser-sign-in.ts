import { Capacitor } from '@capacitor/core';
import { useCallback, useEffect, useState } from 'react';
import {
  APP_SIGN_IN_PATH,
  COLLECT_EVERY_MS,
  COLLECT_TRIES,
  collectPairing,
  makePairing,
  PAIRING_PARAM,
  PENDING_MS,
} from '@/lib/google-in-browser';
import { SITE_ORIGIN } from '@/lib/site-origin';
import { isNative } from '@/lib/standalone';

/**
 * The iPhone app, signed in by the browser's sign-in (the owner, 2026-11-15:
 * "Could we add an option in the app to open the browser and pass the cookie
 * back?"): "Continue sign in using your browser (no password)" on Welcome back.
 *
 * The Home Screen app's way to Google (google-in-browser.ts), for the store
 * app and any sign-in: the app keeps a secret and opens /app-sign-in in the
 * member's own browser with only its hash. Signed in there already, or once
 * they sign in there, where autofill knows them, they confirm; the app, back
 * in front, trades its secret for a sign-in of its own (home-screen-handoff).
 * Whoever holds the secret collects it, so another app that caught the way
 * back (thesciclub://, which any app could claim) has nothing to trade.
 *
 * A thesciclub.com address, not Safari's own: iOS opens it in the browser the
 * member chose, as /app-sign-in is never taken by the app
 * (apple-app-site-association). The app opens it through iOS, not in itself,
 * being another site's address (Capacitor's WebViewDelegationHandler).
 */

/** On /app-sign-in: the store app sent this browser, not the Home Screen app. */
export const FROM_PARAM = 'from';
export const FROM_APP = 'app';

const PENDING_KEY = 'club:browser-pairing';

interface Pending {
  secret: string;
  pairing: string;
  startedAt: number;
}

/** The iPhone store app. Android's app links take every page (later). */
export function browserSignInApplies(): boolean {
  return isNative() && Capacitor.getPlatform() === 'ios';
}

/** /app-sign-in on the club's site, for the browser to open. */
export function browserSignInAddress(pairing: string, origin = SITE_ORIGIN): string {
  const url = new URL(APP_SIGN_IN_PATH, origin);
  url.searchParams.set(PAIRING_PARAM, pairing);
  url.searchParams.set(FROM_PARAM, FROM_APP);
  return url.href;
}

function savePending(pending: Pending): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Nothing to collect then; the member signs in another way.
  }
}

function readPending(now = Date.now()): Pending | null {
  try {
    const kept = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as Partial<Pending> | null;
    if (
      typeof kept?.secret === 'string' &&
      typeof kept.pairing === 'string' &&
      typeof kept.startedAt === 'number' &&
      now - kept.startedAt < PENDING_MS
    ) {
      return { secret: kept.secret, pairing: kept.pairing, startedAt: kept.startedAt };
    }
    if (kept !== null) localStorage.removeItem(PENDING_KEY);
    return null;
  } catch {
    return null;
  }
}

function forget(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing was kept.
  }
}

export const BROWSER_TOOK_TOO_LONG = 'That took too long. Tap Continue sign in again.';
export const BROWSER_NOT_SIGNED_IN =
  'The browser did not sign you in. Try again, or use your email.';

export interface BrowserSignIn {
  waiting: boolean;
  problem: string | null;
  start: () => void;
  reopen: () => void;
  cancel: () => void;
}

/** The button's state, start to finish; null outside the iPhone app. */
export function useBrowserSignIn(
  go: (href: string) => void = (href) => {
    window.location.href = href;
  },
): BrowserSignIn | null {
  const [applies] = useState(browserSignInApplies);
  const [waiting, setWaiting] = useState(() => applies && readPending() !== null);
  const [problem, setProblem] = useState<string | null>(null);

  const start = useCallback(() => {
    setProblem(null);
    void makePairing().then(({ secret, pairing }) => {
      savePending({ secret, pairing, startedAt: Date.now() });
      setWaiting(true);
      go(browserSignInAddress(pairing));
    });
  }, [go]);

  const reopen = useCallback(() => {
    const pending = readPending();
    if (!pending) {
      setWaiting(false);
      setProblem(BROWSER_TOOK_TOO_LONG);
      return;
    }
    go(browserSignInAddress(pending.pairing));
  }, [go]);

  const cancel = useCallback(() => {
    forget();
    setWaiting(false);
    setProblem(null);
  }, []);

  // Back in front: ask a few times, then wait for the next return.
  useEffect(() => {
    if (!waiting) return;
    const controller = new AbortController();
    const stopped = () => controller.signal.aborted;
    let timer = 0;
    let tries = 0;
    let asking = false;
    async function ask() {
      window.clearTimeout(timer);
      if (stopped() || asking || document.visibilityState !== 'visible') return;
      const pending = readPending();
      if (!pending) {
        setWaiting(false);
        setProblem(BROWSER_TOOK_TOO_LONG);
        return;
      }
      asking = true;
      const answer = await collectPairing(pending.secret, {}).catch(() => 'not-yet' as const);
      asking = false;
      if (stopped()) return;
      if (answer !== 'not-yet') {
        // Signed in, the page's gate takes it from here.
        forget();
        setWaiting(false);
        if (answer === 'failed') setProblem(BROWSER_NOT_SIGNED_IN);
        return;
      }
      tries += 1;
      if (tries < COLLECT_TRIES) {
        timer = window.setTimeout(() => {
          void ask();
        }, COLLECT_EVERY_MS);
      }
    }
    function onReturn() {
      if (document.visibilityState !== 'visible') return;
      tries = 0;
      void ask();
    }
    void ask();
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [waiting]);

  if (!applies) return null;
  return { waiting, problem, start, reopen, cancel };
}
