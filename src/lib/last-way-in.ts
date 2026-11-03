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
