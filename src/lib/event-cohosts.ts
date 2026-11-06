import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { calendarChanged } from '@/lib/shared-reads';
import { getSupabase } from '@/lib/supabase';

/**
 * An event's co-hosts (20261105170000): organizations hosting beside its lead
 * host. Set by the lead host's admins or a club administrator; a co-host's
 * own admins can take their organization off.
 */

const REFUSAL = {
  attempt: 'The hosts were not changed.',
  refused: 'You cannot change who hosts this event.',
  missing: 'That event is not on the calendar any more.',
};

type Result = { ok: true } | { ok: false; error: string };

async function call(fn: string, args: Record<string, unknown>): Promise<Result> {
  try {
    const { error } = (await getSupabase().rpc(fn, args)) as { error: Failure | null };
    if (error) return { ok: false, error: describeError(error, REFUSAL) };
    calendarChanged();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: describeThrown(e, REFUSAL) };
  }
}

/** Sets exactly these co-hosts; `later` does the series' later dates too. */
export function setEventCohosts(eventId: string, organizationIds: string[], later = false) {
  return call('set_event_cohosts', { event: eventId, organizations: organizationIds, later });
}

/** Takes one co-host off; `later` does the series' later dates too. */
export function leaveEventCohost(eventId: string, organizationId: string, later = false) {
  return call('leave_event_cohost', { event: eventId, organization: organizationId, later });
}
