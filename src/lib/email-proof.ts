import { useEffect, useState } from 'react';
import { useAccount } from '@/lib/account';
import type { Failure } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Confirming your email once you are in (the owner, 2026-11-04;
 * 20261104110000). Somebody who joined with a code, or with an invite link at
 * another address, confirms it from Me with a code emailed there.
 */

const CHANGED = 'sci:email-proved';

let asked: { memberId: string; address: Promise<string | null> } | null = null;

/** The address to confirm, or null. Read once a session, shared. */
function unprovenEmail(memberId: string): Promise<string | null> {
  if (asked?.memberId !== memberId) {
    const address = (async () => {
      try {
        const { data, error } = (await getSupabase().rpc('my_unproven_email')) as {
          data: unknown;
          error: Failure | null;
        };
        return !error && typeof data === 'string' ? data : null;
      } catch {
        // Unknown asks nothing: the nudge is worth less than a wrong one.
        return null;
      }
    })();
    asked = { memberId, address };
  }
  return asked.address;
}

/** Null while there is nothing to confirm, or while asking. */
export function useUnprovenEmail(): string | null {
  const account = useAccount();
  const memberId = account.status === 'member' ? account.userId : null;
  const [state, setState] = useState<{ memberId: string; address: string | null } | null>(null);

  useEffect(() => {
    if (!memberId) return;
    let live = true;
    const read = () => {
      void unprovenEmail(memberId).then((address) => {
        if (live) setState({ memberId, address });
      });
    };
    read();
    window.addEventListener(CHANGED, read);
    return () => {
      live = false;
      window.removeEventListener(CHANGED, read);
    };
  }, [memberId]);

  return memberId && state?.memberId === memberId ? state.address : null;
}

/** Emails a code; false when one went in the last minute, or too many lately. */
export async function sendEmailCode(): Promise<'sent' | 'wait' | 'failed'> {
  try {
    const result = await getSupabase().functions.invoke<{ sent?: unknown }>('prove-email', {
      body: { send: true },
    });
    if (result.error) return 'failed';
    return result.data?.sent === true ? 'sent' : 'wait';
  } catch {
    return 'failed';
  }
}

export async function confirmEmailCode(code: string): Promise<'proved' | 'refused' | 'failed'> {
  try {
    const result = await getSupabase().functions.invoke<{ proved?: unknown }>('prove-email', {
      body: { code: code.replace(/\D/g, '') },
    });
    if (result.error) return 'failed';
    if (result.data?.proved !== true) return 'refused';
    recheckUnprovenEmail();
    return 'proved';
  } catch {
    return 'failed';
  }
}

/** Asks again: after a code, or a reset link, which proves it too (20261104120000). */
export function recheckUnprovenEmail(): void {
  asked = null;
  window.dispatchEvent(new Event(CHANGED));
}

/** For tests. */
export function forgetUnprovenEmail(): void {
  asked = null;
}
