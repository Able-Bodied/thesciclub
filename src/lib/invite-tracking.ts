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
  /** 'no' is Can't go, from the invite email (20261114070000). */
  rsvp: 'going' | 'interested' | 'no' | null;
  /** An account was made from the link: onboarding started (20261118225000). */
  startedAt: string | null;
  /** Onboarding finished: a member. */
  joinedAt: string | null;
  memberName: string | null;
  /** For administrators, the last onboarding step reached while not yet a member. */
  reachedStep: string | null;
}

export interface InviteGroup {
  key: string;
  /** The event's title, or who sent them. */
  title: string;
  /** The event's day, or the day they were sent. */
  when: string | null;
  isEvent: boolean;
  invites: TrackedInvite[];
  counts: {
    sent: number;
    opened: number;
    viewed: number;
    started: number;
    going: number;
    joined: number;
  };
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
  started_at: string | null;
  member_joined_at: string | null;
  reached_step: string | null;
}

type Loaded = { ok: true; value: TrackedInvite[] } | { ok: false; error: string };

/** The club's own emailed invites, for administrators (admin_invite_tracking). */
export function fetchInviteTracking(): Promise<Loaded> {
  return load('admin_invite_tracking', {});
}

/** An event's emailed invites, for its organizers (event_invite_tracking, 20261114040000). */
export function fetchEventInviteTracking(eventId: string): Promise<Loaded> {
  return load('event_invite_tracking', { p_event: eventId });
}

async function load(fn: string, args: Record<string, unknown>): Promise<Loaded> {
  try {
    const { data, error } = (await getSupabase().rpc(fn, args)) as {
      data: Partial<Row>[] | null;
      error: { message: string } | null;
    };
    if (error) return { ok: false, error: describeError(error, 'Could not load the invites.') };
    return {
      ok: true,
      value: (data ?? []).map((r) => ({
        id: r.id ?? '',
        email: r.email ?? '',
        name: r.name ?? null,
        inviterName: r.inviter_name ?? null,
        eventId: r.event_id ?? null,
        eventTitle: r.event_title ?? null,
        eventStart: r.event_start ?? null,
        createdAt: r.created_at ?? '',
        sentAt: r.sent_at ?? null,
        openedAt: r.opened_at ?? null,
        linkOpenedAt: r.link_opened_at ?? null,
        rsvp: r.rsvp === 'going' || r.rsvp === 'interested' || r.rsvp === 'no' ? r.rsvp : null,
        // A database before 20261118225000 has only joined_at, the account
        // made from the link: taken there as started and joined both.
        startedAt: r.started_at ?? r.joined_at ?? null,
        joinedAt: (r.member_joined_at === undefined ? r.joined_at : r.member_joined_at) ?? null,
        memberName: r.member_name ?? null,
        reachedStep: r.reached_step ?? null,
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
        counts: { sent: 0, opened: 0, viewed: 0, started: 0, going: 0, joined: 0 },
      };
      groups.set(key, group);
    }
    group.invites.push(invite);
  }
  const all = [...groups.values()];
  for (const group of all) group.counts = countInvites(group.invites);
  return all;
}

/**
 * How many reached each step. Sent counts emails that went; one that failed
 * is listed but not counted.
 */
export function countInvites(invites: TrackedInvite[]): InviteGroup['counts'] {
  const counts = { sent: 0, opened: 0, viewed: 0, started: 0, going: 0, joined: 0 };
  for (const invite of invites) {
    const { opened, viewed, started, joined } = inviteSteps(invite);
    if (invite.sentAt !== null) counts.sent += 1;
    if (opened) counts.opened += 1;
    if (viewed) counts.viewed += 1;
    if (started) counts.started += 1;
    if (invite.rsvp === 'going') counts.going += 1;
    if (joined) counts.joined += 1;
  }
  return counts;
}

/** Which steps an invite reached; a later one counts as the earlier ones too. */
export function inviteSteps(invite: TrackedInvite): {
  opened: boolean;
  viewed: boolean;
  started: boolean;
  joined: boolean;
} {
  const joined = invite.joinedAt !== null;
  const started = invite.startedAt !== null || joined;
  const viewed = invite.linkOpenedAt !== null || invite.rsvp !== null || started;
  const opened = invite.openedAt !== null || viewed;
  return { opened, viewed, started, joined };
}
