import { describeError } from '@/lib/describe-error';
import { signInDestination } from '@/lib/sign-in-destination';
import { getSupabase } from '@/lib/supabase';

/**
 * Sign in with Apple, a way to join and to come back.
 *
 * Behind VITE_APPLE_SIGN_IN: Apple's developer approval, and the secret that
 * expires every six months (scripts/apple-secret.mjs), may not be ready, and
 * a button that fails is worse than none. Unset, nothing here is shown.
 */

export const APPLE_RETURN_PARAM = 'apple';

export function appleSignInEnabled(): boolean {
  return Boolean(import.meta.env.VITE_APPLE_SIGN_IN);
}

/** Off to Apple, back to /join. Only resolves if it could not leave. */
export async function signInWithApple(): Promise<{ ok: false; error: string } | { ok: true }> {
  const next = signInDestination(window.location.search);
  const query = new URLSearchParams({ [APPLE_RETURN_PARAM]: 'signin', next });
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo: `${window.location.origin}/join?${query}` },
  });
  return error
    ? { ok: false, error: describeError(error, 'Could not reach Apple.') }
    : { ok: true };
}
