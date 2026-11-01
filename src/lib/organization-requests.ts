import { useCallback, useEffect, useState } from 'react';
import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import type { OrganizationDraft, OrganizationPlaceDraft } from '@/lib/organization-management';
import { getSupabase } from '@/lib/supabase';

/**
 * An organization a member asked to add (20261101010000), waiting for an
 * administrator. The same words the form saves, kept until one approves them.
 * The database decides who may do what.
 */
export interface OrganizationRequest {
  id: string;
  memberId: string | null;
  memberName: string | null;
  draft: OrganizationDraft;
  places: OrganizationPlaceDraft[];
  createdAt: string;
}

interface Row {
  id: string;
  member_id: string | null;
  member_name: string | null;
  draft: OrganizationDraft;
  places: OrganizationPlaceDraft[];
  created_at: string;
}

type Outcome = { ok: true } | { ok: false; error: string };

export async function requestOrganization(
  draft: OrganizationDraft,
  places: OrganizationPlaceDraft[],
): Promise<Outcome> {
  const refusal = 'It was not sent.';
  try {
    const { error } = (await getSupabase().rpc('request_organization', {
      p_draft: draft,
      p_places: places,
    })) as { error: Failure | null };
    return error ? { ok: false, error: describeError(error, refusal) } : { ok: true };
  } catch (thrown) {
    return { ok: false, error: describeThrown(thrown, refusal) };
  }
}

export async function decideOrganizationRequest(
  id: string,
  approve: boolean,
  organizationId: string | null,
): Promise<Outcome> {
  const refusal = approve ? 'The request was not marked approved.' : 'It was not declined.';
  try {
    const { error } = (await getSupabase().rpc('decide_organization_request', {
      p_request: id,
      p_approve: approve,
      p_organization: organizationId,
    })) as { error: Failure | null };
    return error ? { ok: false, error: describeError(error, refusal) } : { ok: true };
  } catch (thrown) {
    return { ok: false, error: describeThrown(thrown, refusal) };
  }
}

/** For an administrator. Anybody else is refused, so it is not read for them. */
export function useOrganizationRequests(enabled: boolean) {
  const [requests, setRequests] = useState<OrganizationRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    const refusal = 'Could not load the requests.';
    void Promise.resolve(getSupabase().rpc('organization_requests_waiting')).then(
      ({ data, error: failure }: { data: unknown; error: Failure | null }) => {
        if (failure) {
          setError(describeError(failure, refusal));
          return;
        }
        setError(null);
        setRequests(
          ((data as Row[] | null) ?? []).map((row) => ({
            id: row.id,
            memberId: row.member_id,
            memberName: row.member_name,
            draft: row.draft,
            places: row.places,
            createdAt: row.created_at,
          })),
        );
      },
      (thrown: unknown) => {
        setError(describeThrown(thrown, refusal));
      },
    );
  }, []);

  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);

  return { requests, error, reload };
}
