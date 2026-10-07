import { useEffect, useState } from 'react';
import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Who speaks for an organization (20261005010000): a member an administrator
 * has linked to it, who may then add, change and delete its hand-added events.
 *
 * The table is unreadable from the API. A member asks `my_organizations()`
 * which ones are theirs; an administrator reads the whole list through
 * `admin_organization_representatives()`. Nothing here is the permission
 * check — `save_event` decides, and these only choose what to draw.
 */

export interface MyOrganizationsState {
  /** Organization ids the viewer speaks for. Empty for most members. */
  ids: Set<string>;
  loading: boolean;
}

export function useMyOrganizations(memberId: string | null): MyOrganizationsState {
  const [state, setState] = useState<MyOrganizationsState>({ ids: new Set(), loading: true });

  useEffect(() => {
    if (!memberId) {
      setState({ ids: new Set(), loading: false });
      return;
    }
    const controller = new AbortController();
    const aborted = () => controller.signal.aborted;
    void (async () => {
      try {
        const { data, error } = (await getSupabase()
          .rpc('my_organizations')
          .abortSignal(controller.signal)) as { data: string[] | null; error: Failure | null };
        if (aborted()) return;
        // A failure here hides a button; it does not need a sentence of its own.
        // The member can still read every event, which is what the screen is for.
        if (error) {
          setState({ ids: new Set(), loading: false });
          return;
        }
        setState({ ids: new Set(data ?? []), loading: false });
      } catch {
        if (aborted()) return;
        setState({ ids: new Set(), loading: false });
      }
    })();
    return () => {
      controller.abort();
    };
  }, [memberId]);

  return state;
}

export interface Representative {
  organizationId: string;
  memberId: string;
  displayName: string;
  /** A suspended member keeps the link but cannot use it until the suspension is lifted. */
  memberStatus: 'active' | 'suspended' | 'removed';
  createdAt: string;
}

interface RepresentativeRow {
  organization_id: string;
  member_id: string;
  display_name: string;
  member_status: string;
  created_at: string;
}

export async function fetchRepresentatives(): Promise<
  { ok: true; representatives: Representative[] } | { ok: false; error: string }
> {
  try {
    const { data, error } = (await getSupabase().rpc('admin_organization_representatives')) as {
      data: RepresentativeRow[] | null;
      error: Failure | null;
    };
    if (error)
      return { ok: false, error: describeError(error, 'Could not load who speaks for whom.') };
    return {
      ok: true,
      representatives: (data ?? []).map((row) => ({
        organizationId: row.organization_id,
        memberId: row.member_id,
        displayName: row.display_name,
        memberStatus: row.member_status as Representative['memberStatus'],
        createdAt: row.created_at,
      })),
    };
  } catch (e) {
    return { ok: false, error: describeThrown(e, 'Could not load who speaks for whom.') };
  }
}

export async function addRepresentative(
  organizationId: string,
  memberId: string,
): Promise<{ ok: boolean; error?: string }> {
  const refusal = { attempt: 'Nobody was added.', missing: 'That member or organization is gone.' };
  try {
    const { error } = await getSupabase().rpc('admin_add_representative', {
      organization: organizationId,
      member: memberId,
    });
    return error ? { ok: false, error: describeError(error, refusal) } : { ok: true };
  } catch (e) {
    return { ok: false, error: describeThrown(e, refusal) };
  }
}

export async function removeRepresentative(
  organizationId: string,
  memberId: string,
): Promise<{ ok: boolean; error?: string }> {
  const refusal = { attempt: 'Nobody was removed.' };
  try {
    const { error } = await getSupabase().rpc('admin_remove_representative', {
      organization: organizationId,
      member: memberId,
    });
    return error ? { ok: false, error: describeError(error, refusal) } : { ok: true };
  } catch (e) {
    return { ok: false, error: describeThrown(e, refusal) };
  }
}
