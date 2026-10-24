import { useCallback, useEffect, useState } from 'react';
import { describeError, describeThrown } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Calendar invitations held for a decision (20261022220000): ones that could
 * not be verified as coming from the representative, or that need the
 * organization chosen. A representative, or an administrator, approves or
 * discards each one. The database decides who may.
 */

export interface HeldInvite {
  id: string;
  title: string;
  starts: string;
  location: string;
  repeats: boolean;
  senderName: string | null;
  senderEmail: string;
  organizationId: string | null;
  organizationName: string | null;
  reason: string | null;
  receivedAt: string;
  /** Set when it would change an event already on the calendar. */
  changesEvent: string | null;
}

interface HeldRow {
  id: string;
  title: string | null;
  starts: string;
  location: string | null;
  repeats: boolean | null;
  sender_name: string | null;
  sender_email: string;
  organization_id: string | null;
  organization_name: string | null;
  reason: string | null;
  received_at: string;
  changes_event: string | null;
}

type Failure = Parameters<typeof describeError>[0];

export function useHeldInvites() {
  const [invites, setInvites] = useState<HeldInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: failure } = (await getSupabase().rpc('my_held_calendar_invites')) as {
        data: HeldRow[] | null;
        error: Failure | null;
      };
      if (failure) setError(describeError(failure, 'Could not load the invitations.'));
      else {
        setError(null);
        setInvites(
          (data ?? []).map((row) => ({
            id: row.id,
            title: row.title ?? 'An event',
            starts: row.starts,
            location: row.location ?? '',
            repeats: Boolean(row.repeats),
            senderName: row.sender_name,
            senderEmail: row.sender_email,
            organizationId: row.organization_id,
            organizationName: row.organization_name,
            reason: row.reason,
            receivedAt: row.received_at,
            changesEvent: row.changes_event,
          })),
        );
      }
    } catch (thrown) {
      setError(describeThrown(thrown, 'Could not load the invitations.'));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { invites, loading, error, reload: load };
}

/** Approve (with the organization when none was chosen) or discard. Resolves to the event. */
export async function decideInvite(
  inviteId: string,
  approve: boolean,
  organizationId: string | null,
): Promise<{ ok: true; eventId: string | null } | { ok: false; error: string }> {
  const refusal = approve ? 'The event was not added.' : 'It was not discarded.';
  try {
    const { data, error } = (await getSupabase().rpc('decide_calendar_invite', {
      invite: inviteId,
      approve,
      organization: organizationId,
    })) as { data: string | null; error: Failure | null };
    if (error) return { ok: false, error: describeError(error, refusal) };
    return { ok: true, eventId: data };
  } catch (thrown) {
    return { ok: false, error: describeThrown(thrown, refusal) };
  }
}

/** The address an organization's representatives invite. */
export const EVENTS_ADDRESS = 'invites@events.thesciclub.com';
