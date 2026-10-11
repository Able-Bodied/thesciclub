import type { UserIdentity } from '@supabase/supabase-js';
import { describeError } from '@/lib/describe-error';
import { signInDestination } from '@/lib/sign-in-destination';
import { getSupabase } from '@/lib/supabase';

/**
 * Google, a way to join and a way to come back.
 *
 * Google's address is already confirmed by Google, so it needs no link in an
 * email. Whether the account may enter is decided afterwards, as for every
 * other way in: a member row, a claimed invite, or an invited address. A
 * Google account with none of those sees the blocked screen, and linking from
 * Me stays as an extra way into an account that already exists.
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

/** Takes Google off. Callers keep one other way in. */
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
  const next = signInDestination(window.location.search);
  const query = new URLSearchParams({ [GOOGLE_RETURN_PARAM]: 'signin', next });
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/join?${query}` },
  });
  return error
    ? { ok: false, error: describeError(error, 'Could not reach Google.') }
    : { ok: true };
}

/**
 * Signs in with the ID token Google's widget handed back (src/lib/google-identity.ts).
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
  return error
    ? { ok: false, error: describeError(error, 'Google did not sign you in.') }
    : { ok: true };
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
