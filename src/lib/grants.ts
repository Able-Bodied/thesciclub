import { useEffect, useState } from 'react';
import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { onForgetSharedReads } from '@/lib/shared-reads';
import { getSupabase } from '@/lib/supabase';

/**
 * An organization's grants and when to apply (20261021010000).
 *
 * `cycleOf` is `grant_window_cycle` in that migration, restated: the page
 * says what the daily job will do. Dates are calendar days in California,
 * as the job counts them.
 */

export interface GrantWindow {
  opensOn: string;
  closesOn: string;
  /** Same month and day every year; a close before the open crosses New Year. */
  yearly: boolean;
}

export interface Grant {
  id: string;
  name: string;
  url: string;
  summary: string;
  applyAnyTime: boolean;
  windows: GrantWindow[];
}

export type GrantStatus =
  | { kind: 'open'; closes: string }
  | { kind: 'upcoming'; opens: string; closes: string }
  | { kind: 'any_time' }
  | { kind: 'unpublished' };

interface Cycle {
  opens: string;
  closes: string;
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** The month or day of a `YYYY-MM-DD`, read at offset 5 or 8. */
const part = (day: string, at: number) => Number(day.slice(at, at + 2));

/** The cycle open on `today` or next to open; null once a dated window has closed. */
export function cycleOf(window: GrantWindow, today: string): Cycle | null {
  if (!window.yearly) {
    return window.closesOn >= today ? { opens: window.opensOn, closes: window.closesOn } : null;
  }
  const [om, od] = [part(window.opensOn, 5), part(window.opensOn, 8)];
  const [cm, cd] = [part(window.closesOn, 5), part(window.closesOn, 8)];
  const year = Number(today.slice(0, 4));
  for (const y of [year - 1, year, year + 1]) {
    const opens = iso(y, om, od);
    let closes = iso(y, cm, cd);
    if (closes < opens) closes = iso(y + 1, cm, cd);
    if (closes >= today) return { opens, closes };
  }
  return null;
}

export function grantStatus(grant: Grant, today: string): GrantStatus {
  const cycles = grant.windows
    .map((w) => cycleOf(w, today))
    .filter((c): c is Cycle => c !== null)
    .sort((a, b) => a.opens.localeCompare(b.opens));
  const open = cycles.find((c) => c.opens <= today);
  if (open) return { kind: 'open', closes: open.closes };
  if (cycles[0]) return { kind: 'upcoming', opens: cycles[0].opens, closes: cycles[0].closes };
  return grant.applyAnyTime ? { kind: 'any_time' } : { kind: 'unpublished' };
}

/** Today's date in California, as `YYYY-MM-DD`. */
export function californiaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(now);
}

/** "Nov 15", or "Jan 31, 2028" when not this year or next. */
export function grantDay(day: string, today: string): string {
  const y = Number(day.slice(0, 4));
  const date = new Date(Date.UTC(y, part(day, 5) - 1, part(day, 8)));
  const thisYear = Number(today.slice(0, 4));
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
    ...(y > thisYear + 1 || y < thisYear ? { year: 'numeric' } : {}),
  });
}

interface GrantRow {
  id: string;
  name: string;
  url: string;
  summary: string;
  apply_any_time: boolean;
  organization_grant_windows: { opens_on: string; closes_on: string; yearly: boolean }[] | null;
}

export interface GrantsState {
  grants: Grant[];
  loading: boolean;
  error: string | null;
}

export async function loadOrganizationGrants(
  organizationId: string,
): Promise<Omit<GrantsState, 'loading'>> {
  try {
    const { data, error } = await getSupabase()
      .from('organization_grants')
      .select(
        'id, name, url, summary, apply_any_time, organization_grant_windows(opens_on, closes_on, yearly)',
      )
      .eq('organization_id', organizationId)
      .order('sort')
      .order('name');
    if (error) return { grants: [], error: describeError(error, 'Could not load grants.') };
    const grants = (data as GrantRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      url: row.url,
      summary: row.summary,
      applyAnyTime: row.apply_any_time,
      windows: (row.organization_grant_windows ?? []).map((w) => ({
        opensOn: w.opens_on,
        closesOn: w.closes_on,
        yearly: w.yearly,
      })),
    }));
    return { grants, error: null };
  } catch (e) {
    return { grants: [], error: describeThrown(e, 'Could not load grants.') };
  }
}

export function useOrganizationGrants(organizationId: string | undefined): GrantsState {
  const [state, setState] = useState<GrantsState>({ grants: [], loading: true, error: null });

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    void loadOrganizationGrants(organizationId).then((result) => {
      if (!cancelled) setState({ ...result, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return state;
}

export interface GrantDraft {
  name: string;
  url: string;
  summary: string;
  applyAnyTime: boolean;
  windows: GrantWindow[];
}

const SAVE_REFUSAL = 'The grant was not saved.';

/** Saves a grant and replaces its rounds (20261021030000); a new one gets its id here. */
export async function saveGrant(
  organizationId: string,
  grantId: string | null,
  draft: GrantDraft,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { data, error } = (await getSupabase().rpc('save_organization_grant', {
      grant_id: grantId,
      organization: organizationId,
      name: draft.name,
      url: draft.url,
      summary: draft.summary,
      apply_any_time: draft.applyAnyTime,
      windows: draft.windows.map((w) => ({
        opens_on: w.opensOn,
        closes_on: w.closesOn,
        yearly: w.yearly,
      })),
    })) as { data: string | null; error: Failure | null };
    return error
      ? {
          ok: false,
          error: describeError(error, {
            attempt: SAVE_REFUSAL,
            duplicate: 'This organization already has a grant with that name.',
          }),
        }
      : { ok: true, id: data ?? grantId ?? '' };
  } catch (e) {
    return { ok: false, error: describeThrown(e, SAVE_REFUSAL) };
  }
}

export async function removeGrant(
  grantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = (await getSupabase().rpc('remove_organization_grant', {
      grant_id: grantId,
    })) as {
      error: Failure | null;
    };
    return error
      ? { ok: false, error: describeError(error, 'The grant was not removed.') }
      : { ok: true };
  } catch (e) {
    return { ok: false, error: describeThrown(e, 'The grant was not removed.') };
  }
}

/**
 * Every organization's grants, for the directory's "Has grants" and "Open
 * now" filters: a few dozen rows, read once and shared like the directory.
 */
let everyGrant: Promise<Map<string, Grant[]>> | null = null;

onForgetSharedReads(() => {
  everyGrant = null;
});

function readEveryGrant(): Promise<Map<string, Grant[]>> {
  everyGrant ??= (async () => {
    const { data, error } = await getSupabase()
      .from('organization_grants')
      .select(
        'id, organization_id, name, url, summary, apply_any_time, organization_grant_windows(opens_on, closes_on, yearly)',
      );
    if (error) throw new Error(describeError(error, 'Could not load grants.'));
    const byOrganization = new Map<string, Grant[]>();
    for (const row of data as (GrantRow & { organization_id: string })[]) {
      const list = byOrganization.get(row.organization_id) ?? [];
      list.push({
        id: row.id,
        name: row.name,
        url: row.url,
        summary: row.summary,
        applyAnyTime: row.apply_any_time,
        windows: (row.organization_grant_windows ?? []).map((w) => ({
          opensOn: w.opens_on,
          closesOn: w.closes_on,
          yearly: w.yearly,
        })),
      });
      byOrganization.set(row.organization_id, list);
    }
    return byOrganization;
  })().catch((e: unknown) => {
    everyGrant = null;
    throw e;
  });
  return everyGrant;
}

/** Organization id → its grants; empty until read, and if it cannot be. */
export function useGrantsByOrganization(): Map<string, Grant[]> {
  const [grants, setGrants] = useState<Map<string, Grant[]>>(new Map());
  useEffect(() => {
    let cancelled = false;
    readEveryGrant().then(
      (read) => {
        if (!cancelled) setGrants(read);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return grants;
}
