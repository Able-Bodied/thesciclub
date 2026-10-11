import type { User, UserIdentity } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { describeError, describeThrown } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * The account's own email, on Me.
 *
 * Changing it, adding one to an account that began with a phone number, and
 * using the address Google already gave are all `updateUser({ email })`:
 * Supabase keeps the old address until the new one is confirmed, and with
 * secure email change on it sends a link to both inboxes. The password goes
 * through the same emailed-link path as Forgot password (sendPasswordReset in
 * auth-email.ts), so nothing here ever asks for the old one.
 */

/** Added to the link in the confirmation email so Me can say it came back. */
export const EMAIL_RETURN_PARAM = 'email';

export type Result = { ok: true } | { ok: false; error: string };

export interface SignInDetails {
  /** The confirmed address, or null for an account that has none yet. */
  email: string | null;
  /** An address waiting for its link to be opened. */
  pendingEmail: string | null;
  /** Google's address, when Google is linked and has given one. */
  googleAddress: string | null;
  providers: { google: UserIdentity | null; apple: UserIdentity | null; email: boolean };
}

function identityEmail(identity: UserIdentity | null): string | null {
  const email: unknown = identity?.identity_data?.email;
  return typeof email === 'string' && email ? email : null;
}

/** An address a link has been sent to and not yet opened: a change, or a first address. */
function pendingAddress(user: User, confirmed: boolean): string | null {
  if (user.new_email) return user.new_email;
  if (user.email && !confirmed) return user.email;
  return null;
}

/** What the signed-in account has, read from the auth user, not from the member row. */
export function readSignInDetails(user: User): SignInDetails {
  const identities = user.identities ?? [];
  const google = identities.find((i) => i.provider === 'google') ?? null;
  const apple = identities.find((i) => i.provider === 'apple') ?? null;
  const confirmed = Boolean(user.email) && Boolean(user.email_confirmed_at);
  return {
    email: confirmed ? (user.email ?? null) : null,
    pendingEmail: pendingAddress(user, confirmed),
    googleAddress: identityEmail(google),
    providers: { google, apple, email: identities.some((i) => i.provider === 'email') },
  };
}

export async function loadSignInDetails(): Promise<
  { ok: true; details: SignInDetails } | { ok: false; error: string }
> {
  const { data, error } = await getSupabase().auth.getUser();
  if (error) return { ok: false, error: describeError(error, 'Could not check your sign-in.') };
  return { ok: true, details: readSignInDetails(data.user) };
}

/** How many ways in remain if `without` were taken off. Phone does not count: there is no phone screen. */
export function waysIn(details: SignInDetails, without?: 'google' | 'apple'): number {
  let count = 0;
  if (details.providers.google && without !== 'google') count += 1;
  if (details.providers.apple && without !== 'apple') count += 1;
  if (details.email) count += 1;
  return count;
}

function redirect(): string {
  return `${window.location.origin}/me?${EMAIL_RETURN_PARAM}=changed`;
}

/** Sets or changes the address; a link goes to the new one (and the old, if there was one). */
export async function changeEmail(email: string): Promise<Result> {
  const { error } = await getSupabase().auth.updateUser(
    { email: email.trim().toLowerCase() },
    { emailRedirectTo: redirect() },
  );
  return error
    ? { ok: false, error: describeError(error, 'The address was not changed. Try again.') }
    : { ok: true };
}

/** For a phone account: an address and a password at once; the link confirms the address. */
export async function addEmailAndPassword(email: string, password: string): Promise<Result> {
  const { error } = await getSupabase().auth.updateUser(
    { email: email.trim().toLowerCase(), password },
    { emailRedirectTo: redirect() },
  );
  return error
    ? { ok: false, error: describeError(error, 'The address was not added. Try again.') }
    : { ok: true };
}

/** Sends the confirmation link for a waiting address again. */
export async function resendEmailChange(email: string): Promise<Result> {
  const { error } = await getSupabase().auth.resend({
    type: 'email_change',
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: redirect() },
  });
  return error
    ? { ok: false, error: describeError(error, 'The email was not sent. Try again in a minute.') }
    : { ok: true };
}

export type SignInState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; details: SignInDetails };

/** The account's sign-in details, with a way to read them again after a change. */
export function useSignInDetails(): { state: SignInState; reload: () => void } {
  const [state, setState] = useState<SignInState>({ status: 'loading' });
  const [version, setVersion] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` is the reload trigger.
  useEffect(() => {
    let cancelled = false;
    void loadSignInDetails()
      .catch((e: unknown) => ({
        ok: false as const,
        error: describeThrown(e, 'Could not check your sign-in.'),
      }))
      .then((result) => {
        if (cancelled) return;
        setState(
          result.ok
            ? { status: 'ready', details: result.details }
            : { status: 'error', error: result.error },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const reload = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);
  return { state, reload };
}
