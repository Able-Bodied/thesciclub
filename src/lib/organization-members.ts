import { useCallback, useEffect, useState } from 'react';
import { useAnnounce } from '@/lib/announce';
import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * An organization's members (the owner, 2026-10-30; 20261030000000): people
 * who have taken part in it, apart from followers, who chose to see its
 * calendar. Somebody becomes one by joining the club on an invite, QR code or
 * link made for it, or by checking in to one of its events.
 *
 * A member reads their own rows and can leave. Org admins read the list. Any
 * member can read the two numbers, and never who follows.
 */

export type JoinedVia = 'invite' | 'code' | 'check_in';

export const JOINED_VIA_LABEL: Record<JoinedVia, string> = {
  invite: 'Invited',
  code: 'QR code or link',
  check_in: 'Checked in',
};

/** The organizations this member belongs to, and the way out of one. */
export function useMyOrganizationMemberships(memberId: string | null) {
  const announce = useAnnounce();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!memberId) {
      setIds(new Set());
      setLoading(false);
      return;
    }
    let live = true;
    void Promise.resolve(
      getSupabase()
        .from('organization_members')
        .select('organization_id')
        .eq('member_id', memberId)
        .is('left_at', null),
    ).then(
      ({ data, error }) => {
        if (!live) return;
        // A failure loses a line on a page, not the page.
        if (!error) {
          setIds(new Set((data as { organization_id: string }[]).map((r) => r.organization_id)));
        }
        setLoading(false);
      },
      () => {
        if (live) setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [memberId]);

  const leave = useCallback(
    async (organizationId: string, name: string) => {
      const refusal = `You are still a member of ${name}.`;
      try {
        const { error } = (await getSupabase().rpc('leave_organization', {
          p_organization: organizationId,
        })) as { error: Failure | null };
        if (error) {
          announce(describeError(error, refusal));
          return false;
        }
      } catch (thrown) {
        announce(describeThrown(thrown, refusal));
        return false;
      }
      setIds((current) => {
        const next = new Set(current);
        next.delete(organizationId);
        return next;
      });
      announce(`You left ${name}.`);
      return true;
    },
    [announce],
  );

  return { ids, loading, leave };
}

/** The two numbers on an organization's page; null until read, or if the read fails. */
export function useOrganizationCounts(organizationId: string | undefined) {
  const [counts, setCounts] = useState<{ members: number; followers: number } | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    let live = true;
    void Promise.resolve(
      getSupabase().rpc('organization_counts', { p_organization: organizationId }),
    ).then(
      ({ data, error }) => {
        const row = (data as { members: number; followers: number }[] | null)?.[0];
        if (live && !error && row) {
          setCounts({ members: row.members, followers: row.followers });
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [organizationId]);

  return counts;
}

export interface OrganizationMember {
  id: string;
  displayName: string;
  username: string | null;
  photoPath: string | null;
  photoAlt: string | null;
  joinedVia: JoinedVia;
  joinedAt: string;
}

interface OrganizationMemberRow {
  member_id: string;
  display_name: string;
  username: string | null;
  photo_path: string | null;
  photo_alt: string | null;
  joined_via: JoinedVia;
  joined_at: string;
}

/** For its org admins and the club's administrators; empty for anybody else. */
export async function fetchOrganizationMembers(
  organizationId: string,
): Promise<{ ok: true; value: OrganizationMember[] } | { ok: false; error: string }> {
  const refusal = 'Could not load the members.';
  try {
    const { data, error } = (await getSupabase().rpc('organization_member_list', {
      p_organization: organizationId,
    })) as { data: OrganizationMemberRow[] | null; error: Failure | null };
    if (error) return { ok: false, error: describeError(error, refusal) };
    return {
      ok: true,
      value: (data ?? []).map((row) => ({
        id: row.member_id,
        displayName: row.display_name,
        username: row.username,
        photoPath: row.photo_path,
        photoAlt: row.photo_alt,
        joinedVia: row.joined_via,
        joinedAt: row.joined_at,
      })),
    };
  } catch (thrown) {
    return { ok: false, error: describeThrown(thrown, refusal) };
  }
}

/** The members' group chat, if this member is in it: RLS shows nobody else the row. */
export function useOrganizationChat(organizationId: string | undefined, memberId: string | null) {
  const [threadId, setThreadId] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId || !memberId) return;
    let live = true;
    void Promise.resolve(
      getSupabase()
        .from('chat_threads')
        .select('id')
        .eq('organization_id', organizationId)
        .maybeSingle(),
    ).then(
      ({ data }) => {
        if (live) setThreadId(data ? String(data.id) : null);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [organizationId, memberId]);

  return threadId;
}
