import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Whether a password reset link worked on this visit.
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
 */

let worked = false;

/** Called once, as the client is made, before it can read the address. */
export function watchForRecoveryLink(client: SupabaseClient): void {
  client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') worked = true;
  });
}

export function recoveryLinkWorked(): boolean {
  return worked;
}

/** After the new password is saved: the link has done its one job. */
export function forgetRecoveryLink(): void {
  worked = false;
}
