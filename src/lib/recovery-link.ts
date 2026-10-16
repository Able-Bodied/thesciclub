import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Whether a password reset link worked in this tab.
 *
 * Supabase uses each link once and lets it live an hour (mailer_otp_exp on
 * the hosted project). A link that is used or old is refused, but the refusal
 * leaves any session already in the browser alone, so "is anybody signed in"
 * cannot tell a working link from a dead one: the owner, 2026-10-14, opened a
 * days-old, already-used link while signed in and was offered a new password.
 *
 * The one sign a link worked is the client's PASSWORD_RECOVERY event, sent
 * once as it reads the link's session out of the address. It is sent while the
 * client starts, often before /reset-password has mounted, and a subscriber
 * who joins later is not told it again. So the watch starts with the client
 * itself (getSupabase), and the page asks here.
 *
 * Kept for the tab, not the page load (the owner, 2026-10-15: a link that had
 * just worked said "This link no longer works"). Opening the link after a
 * release loads the old app, which finds the new one and reloads at once
 * (src/lib/stay-current.ts); the reload has the session but not the event.
 * So it is kept in sessionStorage, for the account the link was for, as long
 * as a link lives. Saving the password, signing out, another account signing
 * in, and a dead link opened in the same tab all end it.
 */

const KEY = 'club:recovery-link';

/** A link's own life; past it, a kept "worked" is not believed. */
export const RECOVERY_LIFE_MS = 60 * 60_000;

interface Kept {
  userId: string | null;
  at: number;
}

function read(): Kept | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    const kept = value as Partial<Kept> | null;
    if (typeof kept?.at === 'number' && (typeof kept.userId === 'string' || kept.userId === null)) {
      return { userId: kept.userId, at: kept.at };
    }
  } catch {
    // Private browsing, or something else in the key: nothing kept.
  }
  return null;
}

let kept: Kept | null = read();

function keep(next: Kept | null): void {
  kept = next;
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Not kept past this page load, which is how it was before.
  }
}

/** Called once, as the client is made, before it can read the address. */
export function watchForRecoveryLink(client: SupabaseClient): void {
  // A dead link comes back with its error in the address: whatever an earlier
  // link in this tab allowed, this one does not.
  if (window.location.hash.includes('error_code=')) keep(null);
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      keep({ userId: session?.user.id ?? null, at: Date.now() });
    } else if (event === 'SIGNED_OUT') {
      keep(null);
    } else if (kept?.userId && session && session.user.id !== kept.userId) {
      keep(null);
    }
  });
}

export function recoveryLinkWorked(now = Date.now()): boolean {
  return kept !== null && now - kept.at < RECOVERY_LIFE_MS;
}

/** After the new password is saved: the link has done its one job. */
export function forgetRecoveryLink(): void {
  keep(null);
}
