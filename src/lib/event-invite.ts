import { describeError } from '@/lib/describe-error';
import { type PublicEvent, type PublicEventRow, publicEventFrom } from '@/lib/event-audience';
import { getSupabase } from '@/lib/supabase';

/**
 * Inviting people who are not in the club to an event, and their side of it
 * (20261114020000; the owner, 2026-11-14). The organizer sends a list; each
 * person's email opens the event's page with ?invite=<token>, which shows
 * them the event even when it is private, with their name and address filled
 * in, and "Accept invite and join the club".
 */

export type EventListOutcome =
  | 'added'
  | 'member_invited'
  | 'member'
  | 'repeat'
  | 'not_an_email'
  | 'blocked'
  | 'on_list'
  | 'limit';

export interface EventListEntry {
  email: string;
  name: string | null;
  outcome: EventListOutcome;
  inviteId: string | null;
}

export async function inviteListToEvent(input: {
  eventId: string;
  people: { email: string; name: string | null }[];
  message: string | null;
}): Promise<{ ok: true; entries: EventListEntry[] } | { ok: false; error: string }> {
  const result = await getSupabase().rpc('event_invite_list', {
    p_event: input.eventId,
    p_people: input.people,
    p_message: input.message,
  });
  if (result.error) {
    return { ok: false, error: describeError(result.error, 'Nobody was invited.') };
  }
  const rows: unknown = result.data;
  if (!Array.isArray(rows)) return { ok: false, error: 'Nobody was invited.' };
  return {
    ok: true,
    entries: (rows as Record<string, unknown>[]).map((r) => ({
      email: typeof r.email === 'string' ? r.email : '',
      name: typeof r.name === 'string' ? r.name : null,
      outcome: (typeof r.outcome === 'string' ? r.outcome : 'not_an_email') as EventListOutcome,
      inviteId: typeof r.invite_id === 'string' ? r.invite_id : null,
    })),
  };
}

export interface EventInvite {
  event: PublicEvent;
  guest: { email: string; name: string; phone: string };
  inviterName: string | null;
  /** They have pressed Accept before; the button still works. */
  accepted: boolean;
}

interface EventInviteRow extends PublicEventRow {
  guest_email: string;
  guest_name: string | null;
  guest_phone: string | null;
  inviter_name: string | null;
  accepted: boolean | null;
}

/** The invite a link holds; null when it is used, withdrawn or not an event's. */
export async function fetchEventInvite(
  token: string,
): Promise<{ ok: true; value: EventInvite | null } | { ok: false; error: string }> {
  try {
    const { data, error } = (await getSupabase().rpc('event_invite_page', {
      p_token: token,
    })) as { data: unknown; error: { message: string } | null };
    if (error) return { ok: false, error: describeError(error, 'Could not open this invite.') };
    const row = (data as EventInviteRow[] | null)?.[0];
    if (!row) return { ok: true, value: null };
    return {
      ok: true,
      value: {
        event: publicEventFrom(row),
        guest: { email: row.guest_email, name: row.guest_name ?? '', phone: row.guest_phone ?? '' },
        inviterName: row.inviter_name,
        accepted: Boolean(row.accepted),
      },
    };
  } catch {
    return { ok: false, error: 'Could not open this invite. Check your connection.' };
  }
}

/**
 * An answer to an event invite (20261114070000): from the email's Going,
 * Maybe or Can't go, or the same buttons on the page.
 */
export type InviteAnswer = 'going' | 'interested' | 'no';

export function inviteAnswerFrom(value: string | null | undefined): InviteAnswer | null {
  return value === 'going' || value === 'interested' || value === 'no' ? value : null;
}

/** Saves their answer; a name only when they typed one. */
export async function answerEventInvite(
  token: string,
  answer: InviteAnswer,
  name?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await getSupabase().rpc('rsvp_event_invite', {
      p_token: token,
      p_status: answer,
      p_name: name?.trim() ? name.trim() : null,
    });
    return error
      ? { ok: false, error: describeError(error, 'Your answer was not saved.') }
      : { ok: true };
  } catch {
    return { ok: false, error: 'Your answer was not saved. Check your connection.' };
  }
}

/** Their answer so far; null when none, or when it cannot be read. */
export async function fetchInviteAnswer(token: string): Promise<InviteAnswer | null> {
  try {
    const { data, error } = (await getSupabase().rpc('event_invite_answer', {
      p_token: token,
    })) as { data: unknown; error: unknown };
    return error ? null : inviteAnswerFrom(typeof data === 'string' ? data : null);
  } catch {
    return null;
  }
}
