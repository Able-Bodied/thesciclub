import type { UserIdentity } from '@supabase/supabase-js';
import { describeError } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Google as a second way in, for a member who already has an account.
 *
 * The phone number stays the account. It is what an invite names and what the
 * club checks against its list, so nobody joins through Google: a member signs
 * in with their number, links Google from Me, and from then on either door
 * opens the same account. A Google account nobody has linked opens nothing —
 * see `20261007010000_only_a_phone_makes_an_account.sql`, which refuses to make
 * an account from it, and `isPhoneless`, which signs it straight back out when
 * that hook is not switched on.
 *
 * Both trips leave the app for Google and come back to it. The query string
 * they come back with says which trip it was, because a member who pressed
 * Cancel at Google comes back with no session and no error either, and the
 * screen still owes them a sentence.
 */

/** Added to the address Google returns to, so the page can tell it came back. */
export const GOOGLE_RETURN_PARAM = 'google';

/** The linked Google identity, if any. Null when there is none. */
export async function loadGoogleIdentity(): Promise<
  { ok: true; identity: UserIdentity | null } | { ok: false; error: string }
> {
  const { data, error } = await getSupabase().auth.getUserIdentities();
  if (error) return { ok: false, error: describeError(error, 'Could not check your sign-in.') };
  return { ok: true, identity: data.identities.find((i) => i.provider === 'google') ?? null };
}

/** The email Google gave, for a member to recognise which account is linked. */
export function googleEmail(identity: UserIdentity): string | null {
  const email: unknown = identity.identity_data?.email;
  return typeof email === 'string' && email ? email : null;
}

/** Off to Google, back to Me. Only resolves if it could not leave. */
export async function linkGoogle(): Promise<{ ok: false; error: string } | { ok: true }> {
  const { error } = await getSupabase().auth.linkIdentity({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/me?${GOOGLE_RETURN_PARAM}=linked` },
  });
  return error
    ? { ok: false, error: describeError(error, 'Could not reach Google.') }
    : { ok: true };
}

/** Takes Google off. The phone number is left, so the account always has a way in. */
export async function unlinkGoogle(
  identity: UserIdentity,
): Promise<{ ok: false; error: string } | { ok: true }> {
  const { error } = await getSupabase().auth.unlinkIdentity(identity);
  return error
    ? { ok: false, error: describeError(error, 'Google is still linked.') }
    : { ok: true };
}

/** Off to Google, back to the sign-in screen. Only resolves if it could not leave. */
export async function signInWithGoogle(): Promise<{ ok: false; error: string } | { ok: true }> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/join?${GOOGLE_RETURN_PARAM}=signin` },
  });
  return error
    ? { ok: false, error: describeError(error, 'Could not reach Google.') }
    : { ok: true };
}

/**
 * Signs in with the ID token Google's widget handed back (src/lib/google-identity.ts).
 *
 * A Google account linked to nobody is refused by the database's hook, and
 * that refusal is the sentence every other way in gives.
 */
export async function signInWithGoogleToken(
  token: string,
  nonce: string,
): Promise<{ ok: false; error: string } | { ok: true }> {
  const { error } = await getSupabase().auth.signInWithIdToken({
    provider: 'google',
    token,
    nonce,
  });
  return error ? { ok: false, error: GOOGLE_NOT_LINKED } : { ok: true };
}

/** Links the Google account picked in Google's widget to the signed-in member. */
export async function linkGoogleToken(
  token: string,
  nonce: string,
): Promise<{ ok: false; error: string } | { ok: true }> {
  const { error } = await getSupabase().auth.linkIdentity({ provider: 'google', token, nonce });
  if (!error) return { ok: true };
  // GoTrue's code for a Google account already on another member's sign-in.
  if (error.code === 'identity_already_exists') return { ok: false, error: GOOGLE_TAKEN };
  return { ok: false, error: describeError(error, 'Google was not linked.') };
}

/** Said when the Google account picked already signs in to somebody else. */
export const GOOGLE_TAKEN =
  'That Google account already signs in to another member. Choose a different one.';

/**
 * Whether the session is an account Google made on its own.
 *
 * Every real account has a phone number, because the only way to make one is
 * to verify a number. An account without one is a Google account that was
 * never linked to a member, let in because the hook that refuses it is off.
 */
export async function isPhoneless(): Promise<boolean> {
  const { data } = await getSupabase().auth.getUser();
  return data.user !== null && !data.user.phone;
}

/** Said when Google came back without letting somebody in. */
export const GOOGLE_NOT_LINKED =
  'Google did not sign you in. If you have not linked Google yet, sign in with your phone number, then link it from Me.';
