import { useEffect, useState } from 'react';
import { currentAppleDevice, currentInstallPlatform } from '@/lib/install';
import { isNative, isStandalone } from '@/lib/standalone';
import { getSupabase } from '@/lib/supabase';

/**
 * Carrying a browser's sign-in into the iPhone app from the App Store (the
 * owner, 2026-11-15: "What would be the smoothest way to pass the account from
 * the browser into the iOS app?"; 20261115100000).
 *
 * Two ways in, both ending in the app with a single-use code it trades for a
 * session of its own, on the page the browser was showing:
 *
 * - Safari's Smart App Banner (index.html): Get, then Open once installed.
 *   Its app-argument is this page's address with the thirty-minute code a
 *   signed-in iPhone tab already keeps for the Home Screen app
 *   (home-screen-handoff.ts). Apple hands it to this app and no other.
 * - "Open in the app", in any iPhone browser (Chrome shows no banner): the
 *   app's own link, thesciclub://open?path=...&code=..., with a two-minute
 *   code made for it, since any app could claim that scheme. A plain
 *   thesciclub.com link would not do: iOS opens the app only for a link from
 *   another site, never from a page of the same one. Where the app is not
 *   installed nothing opens, and the page goes on to the App Store.
 *
 * The app itself: native-shell.ts reads the link, takeAppHandoff signs in.
 */

export const APP_STORE_ID = '6825594961';
export const APP_STORE_PAGE = `https://apps.apple.com/app/id${APP_STORE_ID}`;
/** CFBundleURLTypes in ios/App/App/Info.plist. */
export const APP_SCHEME = 'thesciclub';
/** The banner's code, on the page address it hands the app. */
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

/**
 * The page address the banner hands the app: this page, with the code when a
 * signed-in tab holds one.
 */
export function bannerArgument(origin: string, path: string, code: string | null): string {
  const url = new URL(path, origin);
  url.searchParams.delete(LINK_CODE_PARAM);
  if (code && HANDOFF_CODE.test(code)) url.searchParams.set(LINK_CODE_PARAM, code);
  return url.href;
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
  const answer = await supabase.functions.invoke<{ token_hash?: unknown }>('home-screen-handoff', {
    body: { code },
  });
  const tokenHash = answer.data?.token_hash;
  if (answer.error || typeof tokenHash !== 'string') return 'refused';
  const verified = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
  return verified.error ? 'refused' : 'signed-in';
}
