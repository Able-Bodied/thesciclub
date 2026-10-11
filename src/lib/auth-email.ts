import { describeError } from '@/lib/describe-error';
import { signInDestination } from '@/lib/sign-in-destination';
import { getSupabase } from '@/lib/supabase';

/**
 * Email and password: the account, now that a phone number is not.
 *
 * Each returns `{ ok }` or `{ ok: false, error }` with a sentence, as
 * google-sign-in.ts does.
 *
 * Joining never says whether an address is invited, or whether it already has
 * an account: Supabase answers a sign-up for a taken address as though it had
 * worked, and so does this. The confirmation link is what proves the address
 * is theirs, and only then can the invite check run (see my_invite_status).
 */

export const MIN_PASSWORD = 8;

/** Added to the confirmation link so the page can tell it came back. */
export const CONFIRMED_PARAM = 'confirmed';

export type Result =
  | { ok: true }
  | {
      ok: false;
      error: string;
      /** Signed in before the address was confirmed: the page offers the link again. */
      unconfirmed?: boolean;
    };

export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function cleanEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function signUpWithEmail(email: string, password: string): Promise<Result> {
  const next = signInDestination(window.location.search);
  const query = new URLSearchParams({ [CONFIRMED_PARAM]: '1', next });
  const { error } = await getSupabase().auth.signUp({
    email: cleanEmail(email),
    password,
    options: { emailRedirectTo: `${window.location.origin}/join?${query}` },
  });
  return error
    ? { ok: false, error: describeError(error, 'Could not sign you up.') }
    : { ok: true };
}

export async function signInWithEmail(email: string, password: string): Promise<Result> {
  const { error } = await getSupabase().auth.signInWithPassword({
    email: cleanEmail(email),
    password,
  });
  if (!error) return { ok: true };
  if (error.code === 'email_not_confirmed') {
    return {
      ok: false,
      unconfirmed: true,
      error: 'Confirm your email first: open the link we sent you, or ask for another.',
    };
  }
  return { ok: false, error: 'That email and password did not match.' };
}

/** Says the same whether or not the address has an account. */
export async function sendPasswordReset(email: string): Promise<Result> {
  const { error } = await getSupabase().auth.resetPasswordForEmail(cleanEmail(email), {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  return error
    ? { ok: false, error: describeError(error, 'The email was not sent. Try again in a minute.') }
    : { ok: true };
}

export async function resendConfirmation(email: string): Promise<Result> {
  const next = signInDestination(window.location.search);
  const query = new URLSearchParams({ [CONFIRMED_PARAM]: '1', next });
  const { error } = await getSupabase().auth.resend({
    type: 'signup',
    email: cleanEmail(email),
    options: { emailRedirectTo: `${window.location.origin}/join?${query}` },
  });
  return error
    ? { ok: false, error: describeError(error, 'The email was not sent. Try again in a minute.') }
    : { ok: true };
}
