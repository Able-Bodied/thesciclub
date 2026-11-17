import { useEffect, useState } from 'react';
import type { Failure } from '@/lib/describe-error';
import { useKeptRead } from '@/lib/kept-reads';
import { getSupabase } from '@/lib/supabase';

/**
 * Staff (20261029100000; trusted partners, then verified professionals, then
 * staff, the owner, 2026-11-16: "instead of that we should be marking them as
 * staff"): an administrator makes them staff of an organization
 * (20261117000000), such as a hospital's peer support lead or a physical
 * therapist, and each names their profession on Me (20261104160000). Shown
 * beside their name with a mark. The code and the database still say partner.
 * Nothing here is the permission check; the database decides, and these only
 * choose what to draw.
 */

/** What the role is called wherever it is shown. One place to rename it. */
export const PARTNER_ROLE_NAME = 'Staff';

/** member id → title, e.g. "Physical therapist"; null until they write one. */
export type PartnerTitles = ReadonlyMap<string, string | null>;

/** Who a member is staff of: null for staff made before it was asked. */
export interface StaffOrganization {
  id: string;
  name: string;
}

/** member id → the organization they are staff of, or null. */
export type StaffOrganizations = ReadonlyMap<string, StaffOrganization | null>;

interface StaffRows {
  titles: PartnerTitles;
  organizations: StaffOrganizations;
}

let rows: Promise<StaffRows> | null = null;

function fetchStaffRows(): Promise<StaffRows> {
  rows ??= (async () => {
    // A failure, or no client at all as in tests, draws no label until asked again.
    const failed = (): StaffRows => {
      rows = null;
      return { titles: new Map(), organizations: new Map() };
    };
    try {
      const { data, error } = (await getSupabase()
        .from('club_partners')
        .select('member_id, title, organization_id, organization:organizations(name)')) as {
        data:
          | {
              member_id: string;
              title: string | null;
              organization_id: string | null;
              organization: { name: string } | null;
            }[]
          | null;
        error: Failure | null;
      };
      if (error) return failed();
      const found = data ?? [];
      return {
        titles: new Map(found.map((row) => [row.member_id, row.title])),
        organizations: new Map(
          found.map((row) => [
            row.member_id,
            row.organization_id && row.organization
              ? { id: row.organization_id, name: row.organization.name }
              : null,
          ]),
        ),
      };
    } catch {
      return failed();
    }
  })();
  return rows;
}

/** Read once and shared; `forgetPartnerTitles` after a change. */
export async function fetchPartnerTitles(): Promise<PartnerTitles> {
  return (await fetchStaffRows()).titles;
}

/** Read with the titles, once and shared. */
export async function fetchStaffOrganizations(): Promise<StaffOrganizations> {
  return (await fetchStaffRows()).organizations;
}

export function forgetPartnerTitles(): void {
  rows = null;
}

/** Null until read. A failure draws no label, which is the safe way to fail. */
export function usePartnerTitles(): PartnerTitles | null {
  return useStaffRows()?.titles ?? null;
}

/** Null until read, as the titles. */
export function useStaffOrganizations(): StaffOrganizations | null {
  return useStaffRows()?.organizations ?? null;
}

function useStaffRows(): StaffRows | null {
  const [state, setState] = useState<StaffRows | null>(null);
  useEffect(() => {
    let live = true;
    void fetchStaffRows().then((found) => {
      if (live) setState(found);
    });
    return () => {
      live = false;
    };
  }, []);
  return state;
}

function useYesOrNo(question: string, memberId: string | null): boolean | null {
  const [state, setState] = useState<{ memberId: string | null; yes: boolean | null }>({
    memberId: null,
    yes: null,
  });
  const kept = useKeptRead();
  useEffect(() => {
    if (!memberId) {
      setState({ memberId, yes: false });
      return;
    }
    // A kept tab shown again within the minute (lib/kept-reads.ts).
    if (kept.fresh(memberId)) return;
    const landed = kept.start(memberId);
    const controller = new AbortController();
    void (async () => {
      try {
        const { data, error } = (await getSupabase()
          .rpc(question)
          .abortSignal(controller.signal)) as { data: boolean | null; error: Failure | null };
        if (controller.signal.aborted) return;
        setState({ memberId, yes: error ? false : Boolean(data) });
        if (!error) landed();
      } catch {
        if (!controller.signal.aborted) setState({ memberId, yes: false });
      }
    })();
    return () => {
      controller.abort();
    };
  }, [question, memberId, kept]);
  return state.memberId === memberId ? state.yes : null;
}

/** Whether the signed-in member is a partner: null while asking. */
export function useIAmPartner(memberId: string | null): boolean | null {
  return useYesOrNo('i_am_partner', memberId);
}

/** A partner, an org admin or an administrator: null while asking. */
export function useICanConnect(memberId: string | null): boolean | null {
  return useYesOrNo('i_can_connect', memberId);
}
