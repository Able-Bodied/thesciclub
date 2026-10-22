import { useEffect } from 'react';
import { currentInstallPlatform } from '@/lib/install';
import { useSession } from '@/lib/session';
import { hintSignIn } from '@/lib/sign-in-record';
import { isNative, isStandalone } from '@/lib/standalone';
import { getSupabase } from '@/lib/supabase';

/**
 * Carrying a Safari sign-in into the iPhone Home Screen app (the owner,
 * 2026-10-11; migration 20261012100000, function home-screen-handoff).
 *
 * The Home Screen app keeps its own storage, so somebody who joined in Safari
 * and then added the club would open it signed out. iOS copies the site's
 * cookies into the app once, as it is added, and nothing else. So while
 * somebody is signed in in an iPhone browser tab, a short-lived single-use
 * code sits in a cookie; the app, opening with that cookie and no session,
 * trades it for a session of its own before anything is drawn.
 *
 * Android needs none of this: the installed app shares Chrome's storage.
 */

export const HANDOFF_COOKIE = 'club_handoff';
/** The code's life in the database; the cookie matches it. */
const LIFETIME_SECONDS = 30 * 60;
/** A fresh code this often while the tab is open, so one is always well within its life. */
export const RENEW_MS = 10 * 60_000;
const ISSUED_KEY = 'club:handoff-issued-at';

function cookieTail(): string {
  return `; Path=/; SameSite=Strict${window.location.protocol === 'https:' ? '; Secure' : ''}`;
}

export function heldHandoff(): string | null {
  for (const part of document.cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === HANDOFF_COOKIE) {
      const value = rest.join('=');
      return value === '' ? null : value;
    }
  }
  return null;
}

export function forgetHandoff(): void {
  // biome-ignore lint/suspicious/noDocumentCookie: a cookie is the one thing iOS copies into the Home Screen app, and older iPhones have no Cookie Store API.
  document.cookie = `${HANDOFF_COOKIE}=; Max-Age=0${cookieTail()}`;
  try {
    sessionStorage.removeItem(ISSUED_KEY);
  } catch {
    // Private browsing: nothing was kept.
  }
}

/** An iPhone or iPad browser tab, whose sign-in the Home Screen app would not share. */
export function handoffApplies(): boolean {
  if (isNative()) return false;
  return currentInstallPlatform().startsWith('ios') && !isStandalone();
}

/** Asks for a fresh code and keeps it in the cookie. False when none was given. */
export async function leaveHandoff(): Promise<boolean> {
  // Taken whole: rpc() types its payload as `any`.
  const issued = await getSupabase().rpc('issue_home_screen_handoff');
  const code: unknown = issued.data;
  if (issued.error || typeof code !== 'string' || code === '') return false;
  // biome-ignore lint/suspicious/noDocumentCookie: a cookie is the one thing iOS copies into the Home Screen app, and older iPhones have no Cookie Store API.
  document.cookie = `${HANDOFF_COOKIE}=${code}; Max-Age=${LIFETIME_SECONDS}${cookieTail()}`;
  try {
    sessionStorage.setItem(ISSUED_KEY, String(Date.now()));
  } catch {
    // Without it a reload asks again sooner, which is no harm.
  }
  return true;
}

function issuedAt(): number {
  try {
    return Number(sessionStorage.getItem(ISSUED_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Keeps a fresh code in the cookie while somebody is signed in in an iPhone
 * browser tab, and takes it away when they sign out. Does nothing anywhere else.
 */
export function useLeaveHandoff(): void {
  const session = useSession();
  const signedIn = session.status === 'signed-in';
  const signedOut = session.status === 'signed-out';
  useEffect(() => {
    if (!handoffApplies()) return;
    if (signedOut) {
      forgetHandoff();
      return;
    }
    if (!signedIn) return;
    function renew() {
      if (document.visibilityState !== 'visible') return;
      if (heldHandoff() && Date.now() - issuedAt() < RENEW_MS) return;
      void leaveHandoff();
    }
    renew();
    const timer = window.setInterval(renew, 60_000);
    document.addEventListener('visibilitychange', renew);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', renew);
    };
  }, [signedIn, signedOut]);
}

/** Mounted once, near the top of the app. */
export function LeaveHomeScreenHandoff(): null {
  useLeaveHandoff();
  return null;
}

/**
 * In the Home Screen app, opened with a handoff code and no session: trades
 * the code for a session of its own. The cookie goes either way, since a code
 * works once. Run before the first render, so the app opens signed in rather
 * than at the welcome screen.
 */
export async function takeHandoff(): Promise<'none' | 'signed-in' | 'refused'> {
  // Never in the store app, which is to sign in natively (F6 to F9).
  if (isNative() || !isStandalone()) return 'none';
  const code = heldHandoff();
  if (!code) return 'none';
  forgetHandoff();
  const supabase = getSupabase();
  const { data: current } = await supabase.auth.getSession();
  if (current.session) return 'none';
  const answer = await supabase.functions.invoke<{ token_hash?: unknown }>('home-screen-handoff', {
    body: { code },
  });
  const tokenHash = answer.data?.token_hash;
  if (answer.error || typeof tokenHash !== 'string') return 'refused';
  // A one-time code whatever the browser used: the database looks that up.
  hintSignIn({ homeScreen: true });
  const verified = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
  return verified.error ? 'refused' : 'signed-in';
}
