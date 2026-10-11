import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Whether Apple sign-in works, for the Sign-in tab on Admin.
 *
 * Two facts, read separately because they live in different places:
 *
 * - Switched on: Supabase's public auth settings list each provider and
 *   whether it is enabled. That is the live answer, but it cannot see the
 *   secret, so a provider can be on and still fail.
 * - The secret's date: Apple refuses a secret older than six months, and the
 *   club keeps the date it runs out (sign_in_secrets, 20261011080000). The
 *   secret is never readable, so the date is what says it is still good.
 *
 * Inactive is either one failing: off, or past the date. Renew soon is the
 * last 30 days, when the reminder emails begin.
 */

export const RENEW_WITHIN_DAYS = 30;
/** Apple's limit, a day short: what scripts/apple-secret.mjs gives. */
export const SECRET_LIFETIME_DAYS = 180;

export type AppleState = 'active' | 'renew-soon' | 'inactive' | 'unknown';

export interface AppleHealth {
  state: AppleState;
  /** Null when Supabase could not be asked. */
  enabled: boolean | null;
  expiresOn: string | null;
  /** Negative once the date has passed. */
  daysLeft: number | null;
}

/** Whole days from `today` to `expiresOn`, both ISO dates, without time zones. */
export function daysBetween(today: string, expiresOn: string): number {
  const at = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((at(expiresOn) - at(today)) / 86_400_000);
}

export function appleHealth(
  enabled: boolean | null,
  expiresOn: string | null,
  today: string,
): AppleHealth {
  const daysLeft = expiresOn ? daysBetween(today, expiresOn) : null;
  let state: AppleState;
  if (enabled === false || (daysLeft !== null && daysLeft <= 0)) state = 'inactive';
  else if (enabled === null || daysLeft === null) state = 'unknown';
  else if (daysLeft <= RENEW_WITHIN_DAYS) state = 'renew-soon';
  else state = 'active';
  return { state, enabled, expiresOn, daysLeft };
}

/** Today in California, where the owner is, as an ISO date. */
export function todayIso(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

/** The date a secret made today runs out, for the renewal form's default. */
export function defaultExpiry(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const at = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + SECRET_LIFETIME_DAYS));
  return at.toISOString().slice(0, 10);
}

/** Supabase's public settings: `{ external: { apple: true, … } }`. */
async function appleEnabled(): Promise<boolean | null> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) return null;
  try {
    const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    if (!response.ok) return null;
    const body = (await response.json()) as { external?: Record<string, unknown> };
    const apple = body.external?.apple;
    return typeof apple === 'boolean' ? apple : null;
  } catch {
    return null;
  }
}

async function appleExpiry(): Promise<string | null> {
  const { data } = await getSupabase()
    .from('sign_in_secrets')
    .select('expires_on')
    .eq('provider', 'apple')
    .maybeSingle();
  const row: unknown = data;
  return row && typeof row === 'object' && 'expires_on' in row && typeof row.expires_on === 'string'
    ? row.expires_on
    : null;
}

export async function renewAppleSecret(
  expiresOn: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await getSupabase().rpc('admin_renew_sign_in_secret', {
    p_provider: 'apple',
    p_expires_on: expiresOn,
  });
  return error
    ? { ok: false, error: describeError(error, 'The date was not saved.') }
    : { ok: true };
}

export function useAppleHealth(): { health: AppleHealth | null; reload: () => void } {
  const [health, setHealth] = useState<AppleHealth | null>(null);
  const alive = useRef(true);
  const reload = useCallback(() => {
    void Promise.all([appleEnabled(), appleExpiry().catch(() => null)]).then(
      ([enabled, expiresOn]) => {
        if (alive.current) setHealth(appleHealth(enabled, expiresOn, todayIso()));
      },
    );
  }, []);
  useEffect(() => {
    alive.current = true;
    reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);
  return { health, reload };
}
