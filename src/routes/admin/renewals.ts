import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';
import { daysBetween, RENEW_WITHIN_DAYS } from '@/routes/admin/sign-in-health';

/**
 * Everything the club renews, for Admin → Keys & renewals (`renewals`,
 * 20261028200000). The Apple secret's date is read from sign_in_secrets,
 * where it lives; its row here only names it.
 */

/** The database's limits, as `maxLength` (admin_add_renewal says the same). */
export const RENEWAL_NAME_MAX = 120;
export const RENEWAL_PURPOSE_MAX = 1000;
export const RENEWAL_STEP_MAX = 1000;
export const RENEWAL_STEPS_MAX = 20;

export interface Renewal {
  id: string;
  name: string;
  purpose: string;
  steps: string[];
  /** False: it never runs out. */
  expires: boolean;
  expiresOn: string | null;
  /** 'apple' for the Apple secret, whose date is in sign_in_secrets. */
  signInProvider: string | null;
}

export type RenewalState = 'ok' | 'renew-soon' | 'expired' | 'no-date' | 'no-expiry';

export function renewalState(
  renewal: Pick<Renewal, 'expires' | 'expiresOn'>,
  today: string,
): { state: RenewalState; daysLeft: number | null } {
  if (!renewal.expires) return { state: 'no-expiry', daysLeft: null };
  if (!renewal.expiresOn) return { state: 'no-date', daysLeft: null };
  const daysLeft = daysBetween(today, renewal.expiresOn);
  if (daysLeft < 0) return { state: 'expired', daysLeft };
  if (daysLeft <= RENEW_WITHIN_DAYS) return { state: 'renew-soon', daysLeft };
  return { state: 'ok', daysLeft };
}

/** Soonest first; then those with no date yet, then those that never run out. */
export function sortRenewals(renewals: readonly Renewal[]): Renewal[] {
  const rank = (r: Renewal) => (!r.expires ? 2 : r.expiresOn ? 0 : 1);
  return [...renewals].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.expiresOn ?? '').localeCompare(b.expiresOn ?? '') ||
      a.name.localeCompare(b.name),
  );
}

/** How many want renewing now: the tab's count. */
export function renewalsDue(renewals: readonly Renewal[] | null, today: string): number {
  return (renewals ?? []).filter((r) => {
    const { state } = renewalState(r, today);
    return state === 'renew-soon' || state === 'expired';
  }).length;
}

interface RenewalRow {
  id: string;
  name: string;
  purpose: string | null;
  steps: string[] | null;
  expires: boolean;
  expires_on: string | null;
  sign_in_provider: string | null;
  /** Many-to-one, so an object; an array is taken too. */
  sign_in_secrets: { expires_on: string } | { expires_on: string }[] | null;
}

export function fromRow(row: RenewalRow): Renewal {
  const secret = Array.isArray(row.sign_in_secrets) ? row.sign_in_secrets[0] : row.sign_in_secrets;
  return {
    id: row.id,
    name: row.name,
    purpose: row.purpose ?? '',
    steps: row.steps ?? [],
    expires: row.expires,
    expiresOn: row.sign_in_provider ? (secret?.expires_on ?? null) : row.expires_on,
    signInProvider: row.sign_in_provider,
  };
}

export async function loadRenewals(): Promise<
  { ok: true; renewals: Renewal[] } | { ok: false; error: string }
> {
  const { data, error } = await getSupabase()
    .from('renewals')
    .select(
      'id, name, purpose, steps, expires, expires_on, sign_in_provider, sign_in_secrets(expires_on)',
    );
  if (error) return { ok: false, error: describeError(error, 'Could not read the renewals.') };
  const rows = data as RenewalRow[];
  return { ok: true, renewals: sortRenewals(rows.map(fromRow)) };
}

type Done = { ok: true } | { ok: false; error: string };

export async function setRenewalDate(id: string, expiresOn: string): Promise<Done> {
  const { error } = await getSupabase().rpc('admin_set_renewal_date', {
    p_id: id,
    p_expires_on: expiresOn,
  });
  return error
    ? { ok: false, error: describeError(error, 'The date was not saved.') }
    : { ok: true };
}

export interface NewRenewal {
  name: string;
  purpose: string;
  steps: string[];
  expires: boolean;
  expiresOn: string | null;
}

export async function addRenewal(item: NewRenewal): Promise<Done> {
  const { error } = await getSupabase().rpc('admin_add_renewal', {
    p_name: item.name,
    p_purpose: item.purpose,
    p_steps: item.steps,
    p_expires: item.expires,
    p_expires_on: item.expires ? item.expiresOn : null,
  });
  return error ? { ok: false, error: describeError(error, 'It was not added.') } : { ok: true };
}

export interface RenewalsRead {
  renewals: Renewal[] | null;
  error: string | null;
  reload: () => void;
}

/** Read on the page, not in the panel, so the tab can count what is due. */
export function useRenewals(): RenewalsRead {
  const [renewals, setRenewals] = useState<Renewal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const reload = useCallback(() => {
    void loadRenewals()
      .catch(() => ({ ok: false as const, error: 'Could not read the renewals.' }))
      .then((result) => {
        if (!alive.current) return;
        if (result.ok) {
          setRenewals(result.renewals);
          setError(null);
        } else setError(result.error);
      });
  }, []);
  useEffect(() => {
    alive.current = true;
    reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);
  return { renewals, error, reload };
}
