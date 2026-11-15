import type { Session } from '@supabase/supabase-js';

/**
 * The way somebody last signed in on this device, so the sign-in screen opens
 * on it (the owner, 2026-11-02): a member with only a password should not have
 * to look for the password box. Kept through signing out, on purpose, and only
 * ever says which way: never an address.
 */

export type WayIn = 'email' | 'google' | 'apple';

const KEY = 'club:way-in';

export function lastWayIn(): WayIn | null {
  try {
    const way = localStorage.getItem(KEY);
    return way === 'email' || way === 'google' || way === 'apple' ? way : null;
  } catch {
    return null;
  }
}

/** How this session began, from its token and the hint left by the code that began it. */
export function wayInOf(session: Session, provider: 'google' | 'apple' | null): WayIn | null {
  if (provider) return provider;
  try {
    const part = session.access_token.split('.')[1] ?? '';
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const { amr } = JSON.parse(json) as { amr?: { method?: unknown }[] };
    const method = amr?.[0]?.method;
    if (method === 'password') return 'email';
    if (method !== 'oauth') return null;
    const first: unknown = session.user.app_metadata.provider;
    return first === 'google' || first === 'apple' ? first : null;
  } catch {
    return null;
  }
}

export function rememberWayIn(way: WayIn | null): void {
  if (!way) return;
  try {
    localStorage.setItem(KEY, way);
  } catch {
    // Private browsing: the screen opens as it does for anybody new.
  }
}

/**
 * Whether anybody has been signed in on this device, any way at all (a code
 * from the browser too), so a signed-out visit opens on Welcome back rather
 * than Welcome (the owner, 2026-11-15). Kept through signing out, as above.
 * Noted on every session, so a device already signed in has it on its next open.
 */
const BEFORE_KEY = 'club:signed-in-here';

export function signedInHereBefore(): boolean {
  try {
    return localStorage.getItem(BEFORE_KEY) === '1';
  } catch {
    return false;
  }
}

export function noteSignedInHere(): void {
  try {
    localStorage.setItem(BEFORE_KEY, '1');
  } catch {
    // Private browsing: the Welcome screen, as for anybody new.
  }
}
