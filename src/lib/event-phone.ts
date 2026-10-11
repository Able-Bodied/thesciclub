import { useCallback, useEffect, useState } from 'react';
import { describeError, describeThrown } from '@/lib/describe-error';
import { digitsOf, toE164 } from '@/lib/phone';
import { getSupabase } from '@/lib/supabase';

/**
 * The number a member gives "for events".
 *
 * Optional, typed by the member and never verified: it is not an identity.
 * Event hosts get it with the member's email when they choose Going, so it is
 * asked for in three places (onboarding, Me, and the first Going without one)
 * and they all read and write it here.
 *
 * Stored as 1 + ten digits (`toE164`), or null when there is none, the same
 * shape onboarding writes.
 */

export type PhoneResult = { ok: true } | { ok: false; error: string };

/** The member's number: a string, null for none, undefined while it is unknown. */
export type OwnPhone = string | null | undefined;

export async function loadOwnPhone(
  userId: string,
): Promise<{ ok: true; phone: string | null } | { ok: false; error: string }> {
  try {
    const result = await getSupabase()
      .from('members')
      .select('phone')
      .eq('id', userId)
      .maybeSingle();
    if (result.error) {
      return { ok: false, error: describeError(result.error, 'Could not load your number.') };
    }
    const row: unknown = result.data;
    const phone = row && typeof row === 'object' && 'phone' in row ? row.phone : null;
    return { ok: true, phone: typeof phone === 'string' && phone !== '' ? phone : null };
  } catch (e) {
    return { ok: false, error: describeThrown(e, 'Could not load your number.') };
  }
}

/** `null` clears it. A typed number that is not ten digits is refused before asking. */
export async function saveOwnPhone(userId: string, typed: string | null): Promise<PhoneResult> {
  let value: string | null = null;
  if (typed !== null) {
    value = toE164(typed);
    if (!value) return { ok: false, error: 'Enter a ten-digit number, or skip.' };
  }
  try {
    const { error } = await getSupabase().from('members').update({ phone: value }).eq('id', userId);
    return error
      ? { ok: false, error: describeError(error, 'Your number was not saved.') }
      : { ok: true };
  } catch (e) {
    return { ok: false, error: describeThrown(e, 'Your number was not saved.') };
  }
}

/** "(408) 555-0112" from the stored 1 + ten digits. */
export function displayPhone(stored: string): string {
  const d = digitsOf(stored);
  if (d.length !== 10) return stored;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/**
 * The member's number, and a way to change it, for whatever screen needs it.
 * `phone` is undefined until it has been read, so nothing asks "do you have
 * one?" of a member who does.
 */
export function useOwnPhone(userId: string | null) {
  const [phone, setPhone] = useState<OwnPhone>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setPhone(undefined);
      return;
    }
    let cancelled = false;
    void loadOwnPhone(userId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setPhone(result.phone);
        setError(null);
      } else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const save = useCallback(
    async (typed: string | null): Promise<PhoneResult> => {
      if (!userId) return { ok: false, error: 'Sign in first.' };
      const result = await saveOwnPhone(userId, typed);
      if (result.ok) setPhone(typed === null ? null : toE164(typed));
      return result;
    },
    [userId],
  );

  return { phone, error, save };
}
