import { useCallback, useEffect, useRef, useState } from 'react';
import { currentInstallPlatform } from '@/lib/install';
import { hintSignIn } from '@/lib/sign-in-record';
import { isNative, isStandalone } from '@/lib/standalone';
import { getSupabase } from '@/lib/supabase';

/**
 * Google, for the iPhone Home Screen app, by way of Chrome or Safari (the
 * owner, 2026-10-14; migration 20261015010000).
 *
 * The Home Screen app keeps its own storage, so Google's widget finds no
 * accounts in it, and Google's own sign-in page fails there: "Something went
 * wrong", and after Restart, Error 400. Chrome and Safari have the member's
 * Google accounts. So the app keeps a secret, opens Chrome on /app-sign-in
 * with the secret's hash (Safari when Chrome is not there), and the member
 * signs in there and confirms. That browser leaves a sign-in for the hash;
 * the app, back in front, trades its secret for it through the
 * `home-screen-handoff` edge function and has a session of its own.
 *
 * Nothing can bring the app back to the front by itself: an iPhone has no
 * address that opens a Home Screen app. /app-sign-in tells the member to come
 * back, and the app asks for its sign-in the moment it is in front again.
 *
 * Whether Chrome is installed cannot be asked. The app tries it and watches:
 * opened, it goes into the background within a moment; not installed, it
 * stays in front, and Safari is tried. The browser that opened is remembered,
 * so the wait happens once on a phone, not every time.
 *
 * The browser addresses are Chrome's and Safari's own (`googlechromes://`,
 * `x-safari-https://`). Neither is promised by Apple or Google.
 *
 * iOS opens another app only from a tap. So the first browser is opened in
 * the tap itself, with nothing awaited first: the pairing is made beforehand,
 * as the button is drawn. The second is tried after a wait, no longer in the
 * tap, and iOS may refuse it; then Safari goes first on the next tap.
 */

export type Browser = 'chrome' | 'safari';

export const BROWSER_NAMES: Record<Browser, string> = { chrome: 'Chrome', safari: 'Safari' };

/** Chrome first: most members are signed in to Google there. */
const ORDER: Browser[] = ['chrome', 'safari'];

/** Where the browser lands; the address it opens carries `?pairing=`. */
export const APP_SIGN_IN_PATH = '/app-sign-in';
export const PAIRING_PARAM = 'pairing';

const PENDING_KEY = 'club:google-pairing';
const BROWSER_KEY = 'club:google-browser';

/** The pairing's life, as in the database. */
export const PENDING_MS = 10 * 60_000;

/**
 * How long a browser has to take the app off the screen before the next is
 * tried. Short, since somebody without Chrome sees nothing happen for this
 * long; to be checked on a real iPhone.
 */
export const OPEN_WAIT_MS = 800;

/** How long iOS's "Open in Chrome?" may stay up before it counts as no. */
const ASK_WAIT_MS = 30_000;

/** Asks for the app's sign-in this often, this many times, each time it is in front. */
export const COLLECT_EVERY_MS = 2000;
export const COLLECT_TRIES = 5;

/** The iPhone or iPad Home Screen app, where Google has no accounts to show. */
export function googleGoesToBrowser(): boolean {
  if (isNative()) return false;
  return currentInstallPlatform().startsWith('ios') && isStandalone();
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The app's secret, 32 random bytes in base64url (as the edge function
 * expects), and the sha256 hex of it the browser is given. The database
 * hashes the secret the same way to find the pairing.
 */
export async function makePairing(): Promise<{ secret: string; pairing: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return { secret, pairing: await pairingFor(secret) };
}

/** The sha256 hex of the secret, as redeem_home_screen_pairing works it out. */
export async function pairingFor(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return hex(new Uint8Array(digest));
}

/** The address that opens /app-sign-in in that browser, rather than in this app. */
export function browserAddress(browser: Browser, pairing: string, base: string): string {
  const url = new URL(APP_SIGN_IN_PATH, base);
  url.searchParams.set(PAIRING_PARAM, pairing);
  const secure = url.protocol === 'https:';
  const scheme =
    browser === 'chrome'
      ? secure
        ? 'googlechromes'
        : 'googlechrome'
      : secure
        ? 'x-safari-https'
        : 'x-safari-http';
  return `${scheme}://${url.host}${url.pathname}${url.search}`;
}

function rememberedBrowser(): Browser | null {
  try {
    const kept = localStorage.getItem(BROWSER_KEY);
    return kept === 'chrome' || kept === 'safari' ? kept : null;
  } catch {
    return null;
  }
}

function rememberBrowser(browser: Browser): void {
  try {
    localStorage.setItem(BROWSER_KEY, browser);
  } catch {
    // Not kept: the next time tries Chrome first again, which is no harm.
  }
}

/** The browser that opened last time first, then the rest in the usual order. */
export function browserOrder(remembered: Browser | null): Browser[] {
  return remembered ? [remembered, ...ORDER.filter((b) => b !== remembered)] : ORDER;
}

/**
 * Sends the page to `href` and answers whether something took the app off the
 * screen. iOS's "Open in Chrome?" takes the focus first: that waits for the
 * answer, and a no counts as not opened.
 */
export function tryOpen(
  href: string,
  go: (href: string) => void = (to) => {
    window.location.href = to;
  },
  wait = OPEN_WAIT_MS,
): Promise<boolean> {
  return new Promise((resolve) => {
    let asked = false;
    let timer = window.setTimeout(() => {
      finish(false);
    }, wait);
    function finish(opened: boolean) {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      resolve(opened);
    }
    function onVisibility() {
      if (document.visibilityState === 'hidden') finish(true);
    }
    function onHide() {
      finish(true);
    }
    function onBlur() {
      asked = true;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        finish(false);
      }, ASK_WAIT_MS);
    }
    function onFocus() {
      if (asked) finish(false);
    }
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    go(href);
  });
}

/**
 * Opens /app-sign-in in Chrome or Safari. The browser that opened, or null
 * when neither did.
 */
export async function openInBrowser(
  pairing: string,
  onTrying: (browser: Browser) => void,
  open: (href: string) => Promise<boolean> = tryOpen,
): Promise<Browser | null> {
  for (const browser of browserOrder(rememberedBrowser())) {
    onTrying(browser);
    if (await open(browserAddress(browser, pairing, window.location.origin))) {
      rememberBrowser(browser);
      return browser;
    }
  }
  return null;
}

interface Pending {
  secret: string;
  pairing: string;
  startedAt: number;
}

function savePending(pending: Pending): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Without it the app cannot collect what the browser leaves; the member
    // is told when nothing comes back.
  }
}

/** The sign-in this app is waiting for, while it is still within its life. */
export function pendingPairing(now = Date.now()): Pending | null {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null');
    const p = kept as Partial<Pending> | null;
    if (
      typeof p?.secret === 'string' &&
      typeof p.pairing === 'string' &&
      typeof p.startedAt === 'number' &&
      now - p.startedAt < PENDING_MS
    ) {
      return { secret: p.secret, pairing: p.pairing, startedAt: p.startedAt };
    }
    if (kept !== null) localStorage.removeItem(PENDING_KEY);
    return null;
  } catch {
    return null;
  }
}

export function forgetPairing(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing was kept.
  }
}

/**
 * Asks for the sign-in the browser left for this secret. 'not-yet' until the
 * member has confirmed there; a network failure is 'not-yet' too, and asked again.
 */
export async function collectPairing(secret: string): Promise<'signed-in' | 'not-yet' | 'failed'> {
  const supabase = getSupabase();
  const answer = await supabase.functions.invoke<{ token_hash?: unknown }>('home-screen-handoff', {
    body: { pairing: secret },
  });
  const tokenHash = answer.data?.token_hash;
  if (answer.error || typeof tokenHash !== 'string') return 'not-yet';
  hintSignIn({ provider: 'google', homeScreen: true });
  const verified = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
  return verified.error ? 'failed' : 'signed-in';
}

export type GoogleInBrowserState =
  | { step: 'idle' }
  | { step: 'opening'; browser: Browser }
  | { step: 'waiting'; browser: Browser | null };

export interface GoogleInBrowser {
  state: GoogleInBrowserState;
  problem: string | null;
  start: () => void;
  /** Opens the same browser again, for the same sign-in. */
  reopen: () => void;
  cancel: () => void;
}

export const COULD_NOT_OPEN = 'Chrome and Safari did not open. Sign in with your email instead.';
export const TRY_SAFARI = 'Chrome did not open. Tap Sign in with Google again to use Safari.';
export const TOOK_TOO_LONG = 'That took too long. Tap Sign in with Google again.';
export const NOT_SIGNED_IN = 'Google did not sign you in. Try again, or use your email.';

/**
 * The Home Screen app's Google button, start to finish. Null anywhere else.
 * Mounted on /join, so a sign-in left while iOS closed the app is collected
 * when it opens again.
 */
export function useGoogleInBrowser(
  /** How a browser is tried; a test's stand-in for iOS. */
  attempt: (href: string) => Promise<boolean> = tryOpen,
): GoogleInBrowser | null {
  const [applies] = useState(googleGoesToBrowser);
  const [state, setState] = useState<GoogleInBrowserState>(() =>
    applies && pendingPairing()
      ? { step: 'waiting', browser: rememberedBrowser() }
      : { step: 'idle' },
  );
  const [problem, setProblem] = useState<string | null>(null);
  const opening = useRef(false);

  // Made before the tap, so the tap can open a browser with nothing awaited.
  const ready = useRef<{ secret: string; pairing: string } | null>(null);
  const prepare = useCallback(() => {
    ready.current = null;
    void makePairing().then((made) => {
      ready.current = made;
    });
  }, []);
  useEffect(() => {
    if (applies) prepare();
  }, [applies, prepare]);

  /** Runs in the tap: openInBrowser reaches the first browser before it awaits. */
  const open = useCallback(
    async (pairing: string) => {
      opening.current = true;
      setProblem(null);
      const first = browserOrder(rememberedBrowser())[0];
      const browser = await openInBrowser(
        pairing,
        (trying) => {
          setState({ step: 'opening', browser: trying });
        },
        attempt,
      );
      opening.current = false;
      if (browser) {
        setState({ step: 'waiting', browser });
        return;
      }
      forgetPairing();
      setState({ step: 'idle' });
      if (first === 'chrome') {
        // Safari was tried outside the tap. Next time it goes first, in the tap.
        rememberBrowser('safari');
        setProblem(TRY_SAFARI);
      } else {
        setProblem(COULD_NOT_OPEN);
      }
    },
    [attempt],
  );

  const start = useCallback(() => {
    if (opening.current) return;
    const made = ready.current;
    prepare();
    if (made) {
      savePending({ ...made, startedAt: Date.now() });
      void open(made.pairing);
      return;
    }
    // Tapped before the pairing was made, which is a moment at most.
    void (async () => {
      const { secret, pairing } = await makePairing();
      savePending({ secret, pairing, startedAt: Date.now() });
      await open(pairing);
    })();
  }, [open, prepare]);

  const reopen = useCallback(() => {
    const pending = pendingPairing();
    if (!pending) {
      setState({ step: 'idle' });
      setProblem(TOOK_TOO_LONG);
      return;
    }
    if (!opening.current) void open(pending.pairing);
  }, [open]);

  const cancel = useCallback(() => {
    forgetPairing();
    setState({ step: 'idle' });
    setProblem(null);
  }, []);

  // In front again: ask for the sign-in a few times, then wait for the next return.
  const waiting = state.step === 'waiting';
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
      const pending = pendingPairing();
      if (!pending) {
        setState({ step: 'idle' });
        setProblem(TOOK_TOO_LONG);
        return;
      }
      asking = true;
      const answer = await collectPairing(pending.secret).catch(() => 'not-yet' as const);
      asking = false;
      if (stopped()) return;
      if (answer === 'signed-in') {
        // The session is enough: /join's gate takes it from here.
        forgetPairing();
        setState({ step: 'idle' });
        return;
      }
      if (answer === 'failed') {
        forgetPairing();
        setState({ step: 'idle' });
        setProblem(NOT_SIGNED_IN);
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
  return { state, problem, start, reopen, cancel };
}
