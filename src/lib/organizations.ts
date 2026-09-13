import { useEffect, useState } from 'react';
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
          setState({ organizations: [], byId: new Map(), loading: false, error: error.message });
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
          error: e instanceof Error ? e.message : 'Could not load organizations.',
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
