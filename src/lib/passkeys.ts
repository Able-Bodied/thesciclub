import { describeError } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Passkeys: Face ID, a fingerprint or a security key instead of a password.
 *
 * A Supabase beta, so behind VITE_PASSKEYS (the client is made with the
 * experimental flag in supabase.ts only when it is set) and never offered in
 * a browser that cannot do WebAuthn. A passkey can only be added to an
 * account that already exists: it is offered after onboarding, and on Me.
 */

export interface PasskeyEntry {
  id: string;
  name: string;
  createdAt: string;
}

export type Result = { ok: true } | { ok: false; error: string };

export function passkeysEnabled(): boolean {
  return Boolean(import.meta.env.VITE_PASSKEYS);
}

/** On, and this browser has WebAuthn. */
export function passkeysAvailable(): boolean {
  return passkeysEnabled() && typeof window !== 'undefined' && 'PublicKeyCredential' in window;
}

/** Cancelling the browser's own sheet is a choice, not a failure worth a sentence. */
function cancelled(error: { name?: string }): boolean {
  return error.name === 'NotAllowedError' || error.name === 'AbortError';
}

export async function signInWithPasskey(): Promise<Result> {
  if (!passkeysAvailable()) return { ok: false, error: 'This browser cannot use a passkey.' };
  const { error } = await getSupabase().auth.signInWithPasskey();
  if (!error) return { ok: true };
  return {
    ok: false,
    error: cancelled(error) ? '' : describeError(error, 'That passkey did not sign you in.'),
  };
}

export async function registerPasskey(): Promise<Result> {
  if (!passkeysAvailable()) return { ok: false, error: 'This browser cannot use a passkey.' };
  const { error } = await getSupabase().auth.registerPasskey();
  if (!error) return { ok: true };
  return {
    ok: false,
    error: cancelled(error) ? '' : describeError(error, 'The passkey was not added.'),
  };
}

function nameOf(friendly: string | undefined): string {
  if (!friendly) return 'Passkey';
  return friendly;
}

export async function listPasskeys(): Promise<
  { ok: true; passkeys: PasskeyEntry[] } | { ok: false; error: string }
> {
  const { data, error } = await getSupabase().auth.passkey.list();
  if (error) return { ok: false, error: describeError(error, 'Could not load your passkeys.') };
  return {
    ok: true,
    passkeys: data.map((p) => ({
      id: p.id,
      name: nameOf(p.friendly_name),
      createdAt: p.created_at,
    })),
  };
}

export async function deletePasskey(passkeyId: string): Promise<Result> {
  const { error } = await getSupabase().auth.passkey.delete({ passkeyId });
  return error
    ? { ok: false, error: describeError(error, 'The passkey was not removed.') }
    : { ok: true };
}
