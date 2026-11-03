import { getSupabase } from '@/lib/supabase';

/**
 * Proving the address an invite went to, for somebody signed in at another
 * (20261102040000, function prove-invite).
 */

/** False only when the call failed: the answer never says if a code was sent. */
export async function askForInviteCode(email: string): Promise<boolean> {
  // Not destructured: the client types the result's data as `any`.
  const result = await getSupabase().functions.invoke('prove-invite', { body: { email } });
  return !result.error;
}

export async function proveInviteCode(code: string): Promise<'proved' | 'refused' | 'failed'> {
  const result = await getSupabase().functions.invoke<{ proved?: unknown }>('prove-invite', {
    body: { code },
  });
  if (result.error) return 'failed';
  return result.data?.proved === true ? 'proved' : 'refused';
}
