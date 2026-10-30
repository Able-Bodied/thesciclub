import { useCallback, useEffect, useState } from 'react';
import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * An organization's members (the owner, 2026-10-30; 20261030000000). Join
 * replaces Follow: joining shows you its events and puts you in its members'
 * group chat, and the database keeps organization_follows to the active
 * members, so useOrganizationFollows still answers "who am I in". Somebody is
 * a member by pressing Join, by joining the club on an invite, QR code or link
 * made for it, or by checking in to one of its events.
 *
 * Any member can see an organization's members and a member's organizations.
 * Only its org admins see how each joined, and review those who pressed Join.
 */

export type JoinedVia = 'join' | 'invite' | 'code' | 'check_in';

export const JOINED_VIA_LABEL: Record<JoinedVia, string> = {
  join: 'Pressed Join',
  invite: 'Invited',
  code: 'QR code or link',
  check_in: 'Checked in',
};

/** Why this member was declined, if they were. */
export function useMyDenial(organizationId: string | undefined, memberId: string | null) {
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId || !memberId) return;
    let live = true;
    void Promise.resolve(
      getSupabase()
        .from('organization_members')
        .select('denied_reason')
        .eq('organization_id', organizationId)
        .eq('member_id', memberId)
        .not('denied_at', 'is', null)
        .maybeSingle(),
    ).then(
      ({ data }) => {
        if (live) setReason(data ? String(data.denied_reason) : null);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [organizationId, memberId]);

  return reason;
}

/** How many members it has; null until read, or if the read fails. */
export function useOrganizationMemberCount(organizationId: string | undefined) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    let live = true;
    void Promise.resolve(
      getSupabase().rpc('organization_member_count', { p_organization: organizationId }),
    ).then(
      ({ data, error }) => {
        if (live && !error) setCount(data as number);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [organizationId]);

  return count;
}

/** The organizations on somebody's profile. */
export function useMemberOrganizations(memberId: string | undefined) {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    if (!memberId) return;
    let live = true;
    void Promise.resolve(getSupabase().rpc('member_organizations', { p_member: memberId })).then(
      ({ data, error }) => {
        if (live && !error) setIds((data as string[] | null) ?? []);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [memberId]);

  return ids;
}

interface MemberFace {
  id: string;
  displayName: string;
  username: string | null;
  photoPath: string | null;
  photoAlt: string | null;
}

export interface OrganizationMember extends MemberFace {
  /** Only for its org admins. */
  joinedVia: JoinedVia | null;
  joinedAt: string;
}

interface Row {
  member_id: string;
  display_name: string;
  username: string | null;
  photo_path: string | null;
  photo_alt: string | null;
  joined_at: string;
  joined_via?: JoinedVia | null;
  denied_at?: string | null;
  denied_reason?: string | null;
}

function face(row: Row): MemberFace {
  return {
    id: row.member_id,
    displayName: row.display_name,
    username: row.username,
    photoPath: row.photo_path,
    photoAlt: row.photo_alt,
  };
}

type Read<T> = { ok: true; value: T } | { ok: false; error: string };

async function read<T>(
  name: string,
  args: Record<string, unknown>,
  refusal: string,
  shape: (row: Row) => T,
): Promise<Read<T[]>> {
  try {
    const { data, error } = (await getSupabase().rpc(name, args)) as {
      data: Row[] | null;
      error: Failure | null;
    };
    if (error) return { ok: false, error: describeError(error, refusal) };
    return { ok: true, value: (data ?? []).map(shape) };
  } catch (thrown) {
    return { ok: false, error: describeThrown(thrown, refusal) };
  }
}

export function fetchOrganizationMembers(organizationId: string) {
  return read<OrganizationMember>(
    'organization_member_list',
    { p_organization: organizationId },
    'Could not load the members.',
    (row) => ({ ...face(row), joinedVia: row.joined_via ?? null, joinedAt: row.joined_at }),
  );
}

export interface MemberReview extends MemberFace {
  joinedAt: string;
  deniedAt: string | null;
  deniedReason: string | null;
}

/** Those who pressed Join and wait to be approved, and those denied. */
export function fetchMemberReviews(organizationId: string) {
  return read<MemberReview>(
    'organization_member_reviews',
    { p_organization: organizationId },
    'Could not load who is waiting.',
    (row) => ({
      ...face(row),
      joinedAt: row.joined_at,
      deniedAt: row.denied_at ?? null,
      deniedReason: row.denied_reason ?? null,
    }),
  );
}

/** Approve, which also takes back a denial, or deny with the reason they will read. */
export function useReviewMember(organizationId: string, onDone: () => void) {
  const [error, setError] = useState<string | null>(null);

  const review = useCallback(
    async (memberId: string, approve: boolean, reason: string | null = null) => {
      const refusal = 'That was not saved. Try again.';
      setError(null);
      try {
        const { error: failure } = (await getSupabase().rpc('review_organization_member', {
          p_organization: organizationId,
          p_member: memberId,
          p_approve: approve,
          p_reason: reason,
        })) as { error: Failure | null };
        if (failure) {
          setError(describeError(failure, refusal));
          return false;
        }
      } catch (thrown) {
        setError(describeThrown(thrown, refusal));
        return false;
      }
      onDone();
      return true;
    },
    [organizationId, onDone],
  );

  return { review, error };
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

/** An org admin asking a member to join, by a direct message; once for each. */
export async function inviteToOrganization(
  organizationId: string,
  memberId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const refusal = 'The invite was not sent.';
  try {
    const { error } = (await getSupabase().rpc('invite_to_organization', {
      p_organization: organizationId,
      p_member: memberId,
    })) as { error: Failure | null };
    return error ? { ok: false, error: describeError(error, refusal) } : { ok: true };
  } catch (thrown) {
    return { ok: false, error: describeThrown(thrown, refusal) };
  }
}
