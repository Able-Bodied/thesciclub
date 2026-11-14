/**
 * The email a member gets when they are invited by name to an invite-only
 * event (20261114070000): event_invite_emails returns one row for each, and
 * this words it as the event's own page (../_shared/event-invite-email.ts),
 * with Going, Maybe and Can't go opening the event in the club.
 */

import {
  type EventInviteEmail,
  eventInviteEmail,
  withRsvp,
} from '../_shared/event-invite-email.ts';

export interface DueInvite {
  email: string;
  name: string | null;
  inviter_name: string | null;
  event_id: string;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  timezone: string | null;
  place: string | null;
  photo_path: string | null;
  photo_alt: string | null;
  organization_name: string | null;
}

export function memberInviteEmail(
  due: DueInvite,
  siteUrl: string,
  imageUrl: string | null,
): EventInviteEmail {
  const page = `${siteUrl.replace(/\/+$/, '')}/events/${encodeURIComponent(due.event_id)}`;
  const first = due.name?.trim().split(/\s+/)[0] ?? null;
  return eventInviteEmail({
    inviter: due.inviter_name ?? '',
    name: first,
    event: {
      title: due.title,
      start: due.start_time,
      end: due.end_time,
      timezone: due.timezone,
      allDay: due.all_day,
      place: due.place,
      description: due.description,
      imageUrl,
      imageAlt: due.photo_alt,
      organization: due.organization_name,
    },
    links: {
      going: withRsvp(page, 'going'),
      interested: withRsvp(page, 'interested'),
      no: withRsvp(page, 'no'),
      page,
    },
    reader: 'member',
  });
}
