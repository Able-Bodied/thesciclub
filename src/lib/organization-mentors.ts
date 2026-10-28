import { useEffect, useState } from 'react';
import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { toOrganizationMark } from '@/lib/members';
import { getSupabase } from '@/lib/supabase';
import type { RepresentedOrganization } from '@/types/domain';

/**
 * Mentors are an organization's (20261028000000, the owner, 2026-10-28): an
 * organization's admins make them, and club administrators may for any. The
 * database checks who may; these only ask.
 */

export async function grantMentor(
  organizationId: string,
  memberId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await getSupabase().rpc('grant_mentor', {
      organization: organizationId,
      member: memberId,
    });
    return error
      ? { ok: false, error: describeError(error, 'They were not made a mentor.') }
      : { ok: true };
  } catch (e) {
    return { ok: false, error: describeThrown(e, 'They were not made a mentor.') };
  }
}

export async function revokeMentor(
  organizationId: string,
  memberId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await getSupabase().rpc('revoke_mentor', {
      organization: organizationId,
      member: memberId,
    });
    return error
      ? { ok: false, error: describeError(error, 'They are still a mentor.') }
      : { ok: true };
  } catch (e) {
    return { ok: false, error: describeThrown(e, 'They are still a mentor.') };
  }
}

/** The organizations whose mentor the signed-in member is, for Me. Empty on failure. */
export function useMyMentorOrganizations(memberId: string | null): RepresentedOrganization[] {
  const [organizations, setOrganizations] = useState<RepresentedOrganization[]>([]);

  useEffect(() => {
    if (!memberId) {
      setOrganizations([]);
      return;
    }
    const controller = new AbortController();
    const aborted = () => controller.signal.aborted;
    void (async () => {
      try {
        const { data, error } = (await getSupabase()
          .rpc('my_mentor_organizations')
          .abortSignal(controller.signal)) as {
          data: Parameters<typeof toOrganizationMark>[0][] | null;
          error: Failure | null;
        };
        if (aborted()) return;
        setOrganizations(error ? [] : (data ?? []).map(toOrganizationMark));
      } catch {
        if (aborted()) return;
        setOrganizations([]);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [memberId]);

  return organizations;
}
