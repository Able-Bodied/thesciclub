import { useEffect, useState } from 'react';
import { describeError, describeThrown } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';
import type { Organization } from '@/types/domain';

/**
 * Reading organizations.
 *
 * Public, unlike almost everything else in the club: an organization is part of
 * the shopfront (CONTEXT.md, "What is public"), it publishes itself
 * elsewhere already, and an organization page is a reasonable thing to reach
 * from a search engine.
 *
 * Six rows, changing about never, so the Events tab loads all of them once and
 * looks up hosts in memory rather than joining per event.
 */

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
}

export function useOrganizations(): OrganizationsState {
  const [state, setState] = useState<OrganizationsState>({
    organizations: [],
    byId: new Map(),
    loading: true,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const aborted = () => signal.aborted;

    async function load() {
      try {
        const { data, error } = await getSupabase()
          .from('organizations')
          .select('id, short_code, name, city, description, tags, can_invite, logo_path')
          .order('name')
          .abortSignal(signal);
        if (aborted()) return;
        if (error) {
          setState({
            organizations: [],
            byId: new Map(),
            loading: false,
            error: describeError(error, 'Could not load organizations.'),
          });
          return;
        }
        const organizations = (data as OrganizationRow[]).map(toOrganization);
        setState({
          organizations,
          byId: new Map(organizations.map((o) => [o.id, o])),
          loading: false,
          error: null,
        });
      } catch (e) {
        if (aborted()) return;
        setState({
          organizations: [],
          byId: new Map(),
          loading: false,
          error: describeThrown(e, 'Could not load organizations.'),
        });
      }
    }

    void load();
    return () => {
      controller.abort();
    };
  }, []);

  return state;
}
