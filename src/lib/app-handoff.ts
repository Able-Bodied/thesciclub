import { useEffect, useState } from 'react';
import { browserSignInSecret, forgetBrowserSignIn } from '@/lib/browser-sign-in';
import { currentAppleDevice, currentInstallPlatform } from '@/lib/install';
import { isNative, isStandalone } from '@/lib/standalone';
import { getSupabase } from '@/lib/supabase';

/**
 * Carrying a browser's sign-in into the iPhone app from the App Store (the
 * owner, 2026-11-15: "What would be the smoothest way to pass the account from
 * the browser into the iOS app?"; 20261115100000).
 *
 * Signing in or joining is always in the browser (the owner, 2026-11-15:
 * autofill fills in name, phone and the rest there), and only then is the app
 * suggested: the nudge that was the Home Screen one (install-nudge.tsx), with
 * no Smart App Banner and nothing on the pages before signing in.
 *
 * The nudge first sends to the App Store (Get the app), since a web page
 * cannot tell whether an app is installed and a link to one that is not makes
 * Safari say the address is invalid. Once that has been pressed, it offers
 * "Open in the app": the app’s own link, thesciclub://open?path=...&code=...,
 * with a two-minute code made for it (any app could claim that scheme), ending
 * in the app signed in, on the page the browser was showing. A plain
 * thesciclub.com link would not do: iOS opens the app only for a link from
 * another site, never from a page of the same one.
 *
 * The app itself: native-shell.ts reads the link, takeAppHandoff signs in.
 */

export const APP_STORE_ID = '6825594961';
export const APP_STORE_PAGE = `https://apps.apple.com/app/id${APP_STORE_ID}`;
/** CFBundleURLTypes in ios/App/App/Info.plist. */
export const APP_SCHEME = 'thesciclub';
/** A code on a club address the app is opened with (native-shell.ts). */
export const LINK_CODE_PARAM = 'app_handoff';
/** What the database makes (issue_app_handoff, issue_home_screen_handoff). */
export const HANDOFF_CODE = /^[A-Za-z0-9_-]{43}$/;
/** How long the page waits for the app to take over before the App Store. */
export const FALLBACK_MS = 2500;
/** A fresh link code this often while the button shows; each lasts two minutes. */
export const LINK_CODE_RENEW_MS = 90_000;

/** An iPhone browser tab: where the club's app could be opened or got. */
export function appCouldOpen(): boolean {
  if (isNative() || isStandalone()) return false;
  return currentInstallPlatform().startsWith('ios') && currentAppleDevice() === 'iPhone';
}

/**
 * The club added to an iPhone's Home Screen, the way to it before the app:
 * told of the app once (the owner, 2026-11-15), since no nudge shows there.
 */
export function onIphoneHomeScreen(): boolean {
  if (isNative() || !isStandalone()) return false;
  return currentInstallPlatform().startsWith('ios') && currentAppleDevice() === 'iPhone';
}

const APP_NOTE_KEY = 'club:app-note-seen';

/** Whether the Home Screen copy has shown its note about the app already. */
export function appNoteSeen(): boolean {
  try {
    return localStorage.getItem(APP_NOTE_KEY) !== null;
  } catch {
    return false;
  }
}

export function markAppNoteSeen(now = Date.now()): void {
  try {
    localStorage.setItem(APP_NOTE_KEY, String(now));
  } catch {
    // Private browsing: shown again next time, which is no harm.
  }
}

/** The app's own link to `path`, with a code to sign in by if there is one. */
export function appLink(path: string, code: string | null): string {
  const query = new URLSearchParams({ path });
  if (code) query.set('code', code);
  return `${APP_SCHEME}://open?${query.toString()}`;
}

/**
 * A page of the club, inside the club: a path from the root, never another
 * site written as //host. The app routes nothing else from a link.
 */
export function clubPath(path: string | null): string | null {
  if (!path?.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return null;
  return path;
}

const APP_STORE_KEY = 'club:app-store-visited';

/** Whether this browser has been sent to the App Store for the app already. */
export function appStoreVisited(): boolean {
  try {
    return localStorage.getItem(APP_STORE_KEY) !== null;
  } catch {
    return false;
  }
}

export function markAppStoreVisited(now = Date.now()): void {
  try {
    localStorage.setItem(APP_STORE_KEY, String(now));
  } catch {
    // Private browsing: Get the app again next time, which is no harm.
  }
}

/** A two-minute code for the app's link; null when none could be made. */
export async function issueAppLinkCode(): Promise<string | null> {
  try {
    const issued = await getSupabase().rpc('issue_app_handoff');
    const code: unknown = issued.data;
    return !issued.error && typeof code === 'string' && HANDOFF_CODE.test(code) ? code : null;
  } catch {
    return null;
  }
}

/**
 * Keeps a fresh link code while `active` (signed in, the button showing), so
 * a press opens the app at once: iOS lets a page open an app straight from a
 * tap, not after waiting on the network.
 */
export function useAppLinkCode(active: boolean): string | null {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    if (!active) {
      setCode(null);
      return;
    }
    let live = true;
    const renew = () => {
      if (document.visibilityState !== 'visible') return;
      void issueAppLinkCode().then((next) => {
        if (live) setCode(next);
      });
    };
    renew();
    const timer = window.setInterval(renew, LINK_CODE_RENEW_MS);
    document.addEventListener('visibilitychange', renew);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', renew);
    };
  }, [active]);
  return code;
}

/**
 * Opens the app at `path`; if the page is still showing a moment later, the
 * app is not installed (or was not let open), and the App Store comes next.
 * Not on blur: Safari's "address is invalid" alert for an app that is not
 * there blurs the page too, and that is just when the App Store is wanted.
 */
export function openInApp(
  path: string,
  code: string | null,
  go: (href: string) => void = (href) => {
    window.location.href = href;
  },
): void {
  let left = false;
  const away = () => {
    if (document.visibilityState === 'hidden') left = true;
  };
  const gone = () => {
    left = true;
  };
  document.addEventListener('visibilitychange', away);
  window.addEventListener('pagehide', gone);
  go(appLink(path, code));
  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', away);
    window.removeEventListener('pagehide', gone);
    if (!left && document.visibilityState === 'visible') go(APP_STORE_PAGE);
  }, FALLBACK_MS);
}

/**
 * In the app, opened by a link carrying a code and with no session: trades
 * the code for one (home-screen-handoff, which redeems either kind). Somebody
 * already signed in stays as they are; the code is left to run out.
 */
export async function takeAppHandoff(code: string): Promise<'none' | 'signed-in' | 'refused'> {
  if (!isNative() || !HANDOFF_CODE.test(code)) return 'none';
  const supabase = getSupabase();
  const { data: current } = await supabase.auth.getSession();
  if (current.session) return 'none';
  // Sent by the browser for "Continue sign in using your browser": redeemed
  // only with the secret this app kept (browser-sign-in.ts, 20261115110000).
  const verifier = browserSignInSecret();
  const answer = await supabase.functions.invoke<{ token_hash?: unknown }>('home-screen-handoff', {
    body: verifier ? { code, verifier } : { code },
  });
  const tokenHash = answer.data?.token_hash;
  if (answer.error || typeof tokenHash !== 'string') return 'refused';
  forgetBrowserSignIn();
  const verified = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
  return verified.error ? 'refused' : 'signed-in';
}
