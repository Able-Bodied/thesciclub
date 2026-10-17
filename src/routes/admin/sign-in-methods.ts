import { useCallback, useEffect, useState } from 'react';
import { describeError } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';
import type { StatsPeriod } from '@/routes/admin/club-stats';

/**
 * How each member signs up and signs in, for Admin → Stats (20261016000000).
 *
 * Unlike the rest of Stats this names people (the owner, 2026-10-16). The
 * way an account was made is its first identity, which Supabase keeps; each
 * sign-in is a row the app reports once a session (src/lib/sign-in-record.ts),
 * which the database reads from the session's own token.
 */

/**
 * email, google and apple are the ways in today; phone is on accounts from
 * before 2026-10-10; link is a password reset or an emailed link; oauth is
 * Google or Apple when the database could not tell which (see the migration).
 */
export type SignInMethod = string;

export interface MethodCount {
  signIns: number;
  people: number;
}

export interface SignInAccount {
  id: string;
  name: string | null;
  username: string | null;
  /** Only for an account that is not a member yet, which has no name. */
  email: string | null;
  member: boolean;
  status: string | null;
  createdAt: string;
  signedUpWith: SignInMethod | null;
  /** Every way in linked to the account now. */
  methods: SignInMethod[];
  /** The latest ever, whatever the period. */
  lastSignInAt: string | null;
  lastSignInMethod: SignInMethod | null;
  lastSignInHomeScreen: boolean;
  /** In the period. */
  signIns: number;
  signInMethods: SignInMethod[];
}

export interface SignInMethods {
  asOf: string;
  period: StatsPeriod;
  /** The oldest sign-in recorded, or null before the first. */
  recordedSince: string | null;
  /** Of the accounts made in the period, by the way each was made. */
  signUps: Record<SignInMethod, number>;
  signIns: Record<SignInMethod, MethodCount>;
  /** Of those, the Home Screen app taking a browser's sign-in over. */
  homeScreen: MethodCount;
  /** Made or signed in to in the period, newest sign-in first. */
  accounts: SignInAccount[];
}

const LABELS: Record<string, string> = {
  email: 'Email and password',
  google: 'Google',
  apple: 'Apple',
  phone: 'Phone (old accounts)',
  link: 'One-time link',
  oauth: 'Google or Apple',
};

export function methodLabel(method: SignInMethod | null): string {
  return method ? (LABELS[method] ?? method) : 'Unknown';
}

const PHRASES: Record<string, string> = { phone: 'a phone number', link: 'a one-time link' };

/** In a sentence: "signed in with a one-time link". */
export function methodPhrase(method: SignInMethod | null): string {
  return (method ? PHRASES[method] : undefined) ?? methodLabel(method);
}

const ORDER = ['email', 'google', 'apple'];

/** Today's three always, with nothing as 0; then any other, a link last. */
export function methodOrder(present: SignInMethod[]): SignInMethod[] {
  const others = present
    .filter((m) => !ORDER.includes(m) && m !== 'link')
    .sort((a, b) => a.localeCompare(b));
  return [...ORDER, ...others, ...(present.includes('link') ? ['link'] : [])];
}

export async function fetchSignInMethods(
  period: StatsPeriod,
): Promise<{ ok: true; methods: SignInMethods } | { ok: false; error: string }> {
  const { data, error } = (await getSupabase().rpc('admin_sign_in_methods', { period })) as {
    data: SignInMethods | null;
    error: Parameters<typeof describeError>[0] | null;
  };
  if (error || !data)
    return {
      ok: false,
      error: error
        ? describeError(error, 'Could not load how members sign in.')
        : 'Could not load how members sign in.',
    };
  return { ok: true, methods: data };
}

export function useSignInMethods(period: StatsPeriod) {
  const [methods, setMethods] = useState<SignInMethods | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchSignInMethods(period);
    if (result.ok) {
      setMethods(result.methods);
      setError(null);
    } else {
      setError(result.error);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  return { methods, error, reload: load };
}
