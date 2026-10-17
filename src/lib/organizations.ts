import { useCallback, useEffect, useState } from 'react';
import { describeError, describeThrown } from '@/lib/describe-error';
import { readPages } from '@/lib/read-pages';
import { onForgetSharedReads } from '@/lib/shared-reads';
import { getSupabase } from '@/lib/supabase';
import type { Organization } from '@/types/domain';

/** The member directory, excluding entries an administrator removed. */
interface OrganizationRow {
  id: string;
  short_code: string;
  name: string;
  city: string;
  description: string;
  tags: string[] | null;
  can_invite: boolean;
  logo_path: string | null;
}

export function toOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    shortCode: row.short_code,
    name: row.name,
    city: row.city,
    description: row.description,
    tags: row.tags ?? [],
    canInvite: row.can_invite,
    logoPath: row.logo_path,
  };
}

/**
 * The club organization behind an affiliation, if there is one.
 *
 * `members.affiliations` is free text — the names NorCal SCI's directory used
 * — so a member can be affiliated with something the club has no row for.
 * Those still render, as the short-code tile, which is why this returns null
 * rather than throwing.
 *
 * The comparison is exact, and stays exact. "Christopher Reeve Foundation" sat
 * on two members for a while and matched nothing, because the club's row is
 * "Christopher & Dana Reeve Foundation" — fixed in the data by
 * 20260916000000, deliberately not by loosening this. An organization decides
 * whose logo is on a member's card and who is recorded as vouching for them;
 * see the migration header, and see jobs/event-ingest/series.js for what
 * matching names on a resemblance does to two things that merely read alike.
 *
 * Matched case- and space-insensitively on the name, then on the short code,
 * because the directory was typed by hand and "NorCal SCI " has turned up.
 */
export function organizationByName(
  organizations: Organization[],
  name: string | null | undefined,
): Organization | null {
  if (!name) return null;
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  return (
    organizations.find((o) => o.name.trim().toLowerCase() === wanted) ??
    organizations.find((o) => o.shortCode.trim().toLowerCase() === wanted) ??
    null
  );
}

export interface OrganizationsState {
  organizations: Organization[];
  byId: Map<string, Organization>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

type OrganizationsRead = Omit<OrganizationsState, 'reload' | 'loading'>;

/**
 * One read of the directory, shared by every screen that asks.
 *
 * Peers draws a card per member and each card asks for the organizations (for
 * an affiliation's logo), which was a request per card: 203 on a page of 200
 * members (2026-10-14). The directory is the same for every viewer, so one
 * read in flight serves them all, and a read under a minute old is reused
 * outright. Older than that it is shown while a fresh read runs. A failed read
 * is never kept. `reload` always reads again.
 */
const FRESH_FOR_MS = 60_000;
let shared: { read: OrganizationsRead; at: number } | null = null;
let inFlight: Promise<OrganizationsRead> | null = null;

onForgetSharedReads(() => {
  shared = null;
  inFlight = null;
});

function readOrganizations(): Promise<OrganizationsRead> {
  if (inFlight) return inFlight;
  const read = (async (): Promise<OrganizationsRead> => {
    try {
      const { data, error } = await readPages<OrganizationRow>((from, to) =>
        getSupabase()
          .from('organizations')
          .select('id, short_code, name, city, description, tags, can_invite, logo_path')
          .is('removed_at', null)
          .order('name')
          .order('id')
          .range(from, to),
      );
      if (error) {
        return {
          organizations: [],
          byId: new Map(),
          error: describeError(error, 'Could not load organizations.'),
        };
      }
      const organizations = (data ?? []).map(toOrganization);
      const result = {
        organizations,
        byId: new Map(organizations.map((o) => [o.id, o])),
        error: null,
      };
      shared = { read: result, at: Date.now() };
      return result;
    } catch (e) {
      return {
        organizations: [],
        byId: new Map(),
        error: describeThrown(e, 'Could not load organizations.'),
      };
    }
  })();
  inFlight = read;
  void read.finally(() => {
    if (inFlight === read) inFlight = null;
  });
  return read;
}

export function useOrganizations(): OrganizationsState {
  const [state, setState] = useState<Omit<OrganizationsState, 'reload'>>(() =>
    shared
      ? { ...shared.read, loading: false }
      : { organizations: [], byId: new Map(), loading: true, error: null },
  );

  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    if (revision === 0 && shared && Date.now() - shared.at < FRESH_FOR_MS) return;
    if (revision > 0) inFlight = null;
    let live = true;
    void readOrganizations().then((read) => {
      if (live) setState({ ...read, loading: false });
    });
    return () => {
      live = false;
    };
  }, [revision]);

  return { ...state, reload };
}
