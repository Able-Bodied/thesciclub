import { Capacitor } from '@capacitor/core';
import { useCallback, useEffect, useState } from 'react';
import { APP_SIGN_IN_PATH, makePairing, PAIRING_PARAM, PENDING_MS } from '@/lib/google-in-browser';
import { SITE_ORIGIN } from '@/lib/site-origin';
import { isNative } from '@/lib/standalone';

/**
 * The iPhone app, signed in by the browser's sign-in (the owner, 2026-11-15:
 * "Could we add an option in the app to open the browser and pass the cookie
 * back?", then "without even having the user tap"; 20261115110000):
 * "Continue sign in using your browser (no password)" on Welcome back.
 *
 * The app makes a secret, keeps it, and opens /app-sign-in in the member's own
 * browser with only its sha256 (the pairing). That browser, signed in already
 * or once they sign in there, where autofill knows them, sends a two-minute
 * code bound to the pairing straight back to the app
 * (thesciclub://open?...&code=...), and the app redeems it with the secret
 * (takeAppHandoff). iOS's own "Open in The SCI Club?" is the only tap.
 *
 * The code goes to the phone the browser is on, never to whoever made the
 * link, and is no use without the secret: a link somebody made and sent a
 * member hands their sign-in to nobody.
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

/** The secret to redeem a code from the browser with, while one is awaited. */
export function browserSignInSecret(): string | null {
  return readPending()?.secret ?? null;
}

export function forgetBrowserSignIn(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing was kept.
  }
}

export const BROWSER_TOOK_TOO_LONG = 'That took too long. Tap Continue sign in again.';

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
      try {
        localStorage.setItem(
          PENDING_KEY,
          JSON.stringify({ secret, pairing, startedAt: Date.now() } satisfies Pending),
        );
      } catch {
        // No secret kept, so nothing the browser sends can be redeemed.
        return;
      }
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
    forgetBrowserSignIn();
    setWaiting(false);
    setProblem(null);
  }, []);

  // Back in front without the code (iOS's question answered Cancel, or the
  // app opened another way): still waiting while the secret lasts.
  useEffect(() => {
    if (!waiting) return;
    function onReturn() {
      if (document.visibilityState === 'visible' && !readPending()) setWaiting(false);
    }
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [waiting]);

  if (!applies) return null;
  return { waiting, problem, start, reopen, cancel };
}
