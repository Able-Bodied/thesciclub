import { describeError } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * How the emailed invites did (the owner, 2026-11-14: "who opened the e-mail,
 * who viewed the event page, who RSVP'd, who also joined the club"), from
 * admin_invite_tracking (20261114030000). Grouped by the event an invite was
 * sent for, or else by who sent it and the day.
 */

export interface TrackedInvite {
  id: string;
  email: string;
  name: string | null;
  inviterName: string | null;
  eventId: string | null;
  eventTitle: string | null;
  eventStart: string | null;
  createdAt: string;
  sentAt: string | null;
  openedAt: string | null;
  linkOpenedAt: string | null;
  rsvp: 'going' | 'interested' | null;
  joinedAt: string | null;
  memberName: string | null;
}

export interface InviteGroup {
  key: string;
  /** The event's title, or who sent them. */
  title: string;
  /** The event's day, or the day they were sent. */
  when: string | null;
  isEvent: boolean;
  invites: TrackedInvite[];
  counts: { sent: number; opened: number; viewed: number; going: number; joined: number };
}

interface Row {
  id: string;
  email: string;
  name: string | null;
  inviter_name: string | null;
  event_id: string | null;
  event_title: string | null;
  event_start: string | null;
  created_at: string;
  sent_at: string | null;
  opened_at: string | null;
  link_opened_at: string | null;
  rsvp: string | null;
  joined_at: string | null;
  member_name: string | null;
}

export async function fetchInviteTracking(): Promise<
  { ok: true; value: TrackedInvite[] } | { ok: false; error: string }
> {
  try {
    const { data, error } = (await getSupabase().rpc('admin_invite_tracking', {})) as {
      data: Row[] | null;
      error: { message: string } | null;
    };
    if (error) return { ok: false, error: describeError(error, 'Could not load the invites.') };
    return {
      ok: true,
      value: (data ?? []).map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        inviterName: r.inviter_name,
        eventId: r.event_id,
        eventTitle: r.event_title,
        eventStart: r.event_start,
        createdAt: r.created_at,
        sentAt: r.sent_at,
        openedAt: r.opened_at,
        linkOpenedAt: r.link_opened_at,
        rsvp: r.rsvp === 'going' || r.rsvp === 'interested' ? r.rsvp : null,
        joinedAt: r.joined_at,
        memberName: r.member_name,
      })),
    };
  } catch {
    return { ok: false, error: 'Could not load the invites. Check your connection.' };
  }
}

function day(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  });
}

/**
 * Event invites by event; the rest by who sent them and the day, in the
 * reader's time zone. Newest first, as the rows come. A later step counts
 * as the earlier ones too: somebody who joined from the link opened it, even
 * when their mail app never loaded the picture.
 */
export function groupInvites(invites: TrackedInvite[], timeZone?: string): InviteGroup[] {
  const groups = new Map<string, InviteGroup>();
  for (const invite of invites) {
    const isEvent = invite.eventId !== null;
    const sentDay = day(invite.createdAt, timeZone);
    const key = isEvent
      ? `event:${invite.eventId ?? ''}`
      : `sent:${invite.inviterName ?? ''}:${sentDay}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        title: isEvent
          ? (invite.eventTitle ?? 'An event')
          : `From ${invite.inviterName ?? 'the club'}`,
        when: isEvent ? (invite.eventStart ? day(invite.eventStart, timeZone) : null) : sentDay,
        isEvent,
        invites: [],
        counts: { sent: 0, opened: 0, viewed: 0, going: 0, joined: 0 },
      };
      groups.set(key, group);
    }
    group.invites.push(invite);
    const joined = invite.joinedAt !== null;
    const going = invite.rsvp === 'going';
    const viewed = invite.linkOpenedAt !== null || going || joined;
    group.counts.sent += 1;
    if (invite.openedAt !== null || viewed) group.counts.opened += 1;
    if (viewed) group.counts.viewed += 1;
    if (going) group.counts.going += 1;
    if (joined) group.counts.joined += 1;
  }
  return [...groups.values()];
}
