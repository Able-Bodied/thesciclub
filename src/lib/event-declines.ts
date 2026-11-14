import { describeError, describeThrown } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Can't go, on the club's own event page (20261114080000; the owner,
 * 2026-11-14). It takes back a Going or Interested, and only the member and
 * the event's organizers see it. Going or Interested again clears it, in the
 * database, from any build.
 */

const REFUSAL = 'Could not save that.';

export interface EventDecline {
  memberId: string;
  name: string;
  username: string;
  photoPath: string | null;
  declinedAt: string;
}

export async function setEventDeclined(
  eventId: string,
  declined: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await getSupabase().rpc('set_event_declined', {
      p_event: eventId,
      p_declined: declined,
    });
    return error ? { ok: false, error: describeError(error, REFUSAL) } : { ok: true };
  } catch (e) {
    return { ok: false, error: describeThrown(e, REFUSAL) };
  }
}

export async function fetchMyEventDeclined(eventId: string): Promise<boolean> {
  try {
    const { data, error } = (await getSupabase().rpc('my_event_declined', {
      p_event: eventId,
    })) as { data: unknown; error: unknown };
    return !error && data === true;
  } catch {
    return false;
  }
}

/** For the event's organizers; anyone else is refused. */
export async function fetchEventDeclines(
  eventId: string,
): Promise<{ ok: true; value: EventDecline[] } | { ok: false; error: string }> {
  try {
    const { data, error } = (await getSupabase().rpc('event_declines_for', {
      p_event: eventId,
    })) as {
      data:
        | {
            member_id: string;
            name: string;
            username: string;
            photo_path: string | null;
            declined_at: string;
          }[]
        | null;
      error: { message: string; code?: string } | null;
    };
    if (error) return { ok: false, error: describeError(error, 'Could not read who can’t go.') };
    return {
      ok: true,
      value: (data ?? []).map((row) => ({
        memberId: row.member_id,
        name: row.name,
        username: row.username,
        photoPath: row.photo_path,
        declinedAt: row.declined_at,
      })),
    };
  } catch (e) {
    return { ok: false, error: describeThrown(e, 'Could not read who can’t go.') };
  }
}
