import { useEffect } from 'react';
import { cleanEmail, signInOnceConfirmed } from '@/lib/auth-email';

/**
 * Joining on a computer and opening the link on a phone.
 *
 * While "Check your email" shows, the page tries the address and password
 * just typed, so the computer goes on by itself once the link is opened
 * anywhere. Sign-ins are limited per IP (30 in 5 minutes), so it tries every
 * 15 seconds, sooner when the tab comes back, and only while it is seen.
 *
 * The password lives only in memory. After a refresh the page has just the
 * address, kept for this tab, and offers the sign-in with it filled in.
 */

const EVERY_MS = 15_000;
const SOONEST_MS = 5_000;
const FOR_MS = 15 * 60_000;
const KEY = 'sciclub.awaitingConfirmation';

export function rememberAwaiting(email: string): void {
  try {
    window.sessionStorage.setItem(KEY, cleanEmail(email));
  } catch {
    // Private browsing: a refresh just starts at the door.
  }
}

export function awaitingEmail(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function forgetAwaiting(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing was kept.
  }
}

export interface Credentials {
  email: string;
  password: string;
}

/** Tries to sign in until the address is confirmed; null is not trying. */
export function useSignInOnceConfirmed(credentials: Credentials | null): void {
  useEffect(() => {
    if (!credentials) return;
    const until = Date.now() + FOR_MS;
    let last = 0;
    let busy = false;
    let stopped = false;

    const attempt = async () => {
      if (stopped || busy || document.visibilityState !== 'visible') return;
      if (Date.now() > until) {
        stopped = true;
        return;
      }
      if (Date.now() - last < SOONEST_MS) return;
      last = Date.now();
      busy = true;
      const result = await signInOnceConfirmed(credentials.email, credentials.password);
      busy = false;
      // 'in' needs nothing more: the session reaches the page as any sign-in does.
      if (result !== 'waiting') stopped = true;
    };
    const soon = () => {
      void attempt();
    };

    const timer = window.setInterval(soon, EVERY_MS);
    document.addEventListener('visibilitychange', soon);
    window.addEventListener('focus', soon);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', soon);
      window.removeEventListener('focus', soon);
    };
  }, [credentials]);
}
