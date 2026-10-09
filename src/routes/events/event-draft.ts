import { type DateParts, EMPTY_DATE_PARTS, readDate } from '@/lib/date-parts';
import { type EventDraftPayload, HAND_ADDED_TIMEZONE } from '@/lib/events';
import type { ClubEvent, EventFormat, Organization } from '@/types/domain';

/**
 * The event form's rules, as pure functions: who may add what, how a typed
 * time becomes an instant, and what is still missing.
 *
 * None of it is the permission check. `save_event` (20261005020000) checks all
 * of it again; this decides what to draw and says what is missing before the
 * button is pressed rather than after.
 */

/** The host choice for an event no organization runs: the owner's "self or community hosted". */
export const NO_ORGANIZATION = 'none';

export interface EventDraft {
  /** An organization id, `NO_ORGANIZATION`, or '' when nothing is chosen yet. */
  host: string;
  /** Who hosts it, in words, when no organization does. */
  hostName: string;
  title: string;
  description: string;
  date: DateParts;
  /** As typed: "6:30 pm". */
  startTime: string;
  endTime: string;
  format: EventFormat | null;
  location: string;
  city: string;
  url: string;
  registrationUrl: string;
}

export const TITLE_MAX = 140;
export const DESCRIPTION_MAX = 4000;
export const HOST_NAME_MAX = 120;
export const LOCATION_MAX = 300;
export const CITY_MAX = 100;

/* --------------------------------------------------------------- who may */

/** Whether the viewer sees "Add an event" at all. */
export function mayAddEvents(isAdmin: boolean, myOrganizations: Set<string>): boolean {
  return isAdmin || myOrganizations.size > 0;
}

/**
 * Whether the viewer may change or delete this event: one added by hand, and
 * either they are an administrator or it is an organization's they speak for.
 */
export function mayChangeEvent(
  event: ClubEvent,
  isAdmin: boolean,
  myOrganizations: Set<string>,
): boolean {
  if (!event.handAdded) return false;
  if (isAdmin) return true;
  return event.organizationId !== null && myOrganizations.has(event.organizationId);
}

/** The organizations the viewer may pick as host: all of them for an administrator. */
export function hostOptions(
  organizations: Organization[],
  isAdmin: boolean,
  myOrganizations: Set<string>,
): Organization[] {
  return isAdmin ? organizations : organizations.filter((o) => myOrganizations.has(o.id));
}

/* --------------------------------------------------------------- drafts */

/**
 * A fresh form. With exactly one organization to choose from it is chosen;
 * otherwise nothing is, so an administrator never posts for NorCal SCI by
 * leaving a default alone.
 */
export function emptyDraft(onlyHost: string | null): EventDraft {
  return {
    host: onlyHost ?? '',
    hostName: '',
    title: '',
    description: '',
    date: EMPTY_DATE_PARTS,
    startTime: '',
    endTime: '',
    format: null,
    location: '',
    city: '',
    url: '',
    registrationUrl: '',
  };
}

/** The form for an event already on the calendar, in its own zone. */
export function draftFromEvent(event: ClubEvent): EventDraft {
  const start = wallClock(event.startTime, event.timezone);
  return {
    host: event.organizationId ?? NO_ORGANIZATION,
    hostName: event.hostName ?? '',
    title: event.title,
    description: event.description,
    date: { month: String(start.month), day: String(start.day), year: String(start.year) },
    startTime: timeText(start.hour, start.minute),
    endTime: event.endTime
      ? (() => {
          const end = wallClock(event.endTime, event.timezone);
          return timeText(end.hour, end.minute);
        })()
      : '',
    format: event.format,
    location: event.location,
    city: event.city ?? '',
    url: event.url ?? '',
    registrationUrl: event.registrationUrl ?? '',
  };
}

/* ---------------------------------------------------------------- times */

export interface TimeOfDay {
  hour: number;
  minute: number;
}

export type TimeReading =
  | { kind: 'empty' }
  | { kind: 'time'; time: TimeOfDay }
  | { kind: 'invalid'; problem: string };

/**
 * A time as somebody would type or say it: "7pm", "7:30 pm", "7.30 p.m.",
 * "19:00", "noon". A typed box rather than the browser's time picker for the
 * reason the date is three boxes (lib/date-parts.ts): voice control and a
 * switch can fill a box, and cannot name a picker's segments.
 *
 * Twelve-hour times need am or pm. "7:30" alone is a guess either way, and a
 * support group listed at 7:30 in the morning is somebody's wasted trip.
 */
export function readTime(text: string): TimeReading {
  const t = text.trim().toLowerCase();
  if (!t) return { kind: 'empty' };
  if (t === 'noon' || t === 'midday') return { kind: 'time', time: { hour: 12, minute: 0 } };
  if (t === 'midnight') return { kind: 'time', time: { hour: 0, minute: 0 } };

  const match = /^(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?|a|p)?$/.exec(t);
  if (!match?.[1]) return { kind: 'invalid', problem: 'Write a time like 6:30 pm.' };
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const half = match[3]?.startsWith('a') ? 'am' : match[3]?.startsWith('p') ? 'pm' : null;
  if (minute > 59) return { kind: 'invalid', problem: 'The minutes go up to 59.' };

  if (half) {
    if (hour < 1 || hour > 12) return { kind: 'invalid', problem: 'Write a time like 6:30 pm.' };
    const h24 = (hour % 12) + (half === 'pm' ? 12 : 0);
    return { kind: 'time', time: { hour: h24, minute } };
  }
  // 13:00 to 23:59, and 0:00, cannot be anything but a 24-hour time.
  if (hour >= 13 && hour <= 23) return { kind: 'time', time: { hour, minute } };
  if (hour === 0) return { kind: 'time', time: { hour: 0, minute } };
  if (hour > 23) return { kind: 'invalid', problem: 'Write a time like 6:30 pm.' };
  return { kind: 'invalid', problem: 'Add am or pm.' };
}

/** "6:30 pm", the way the form shows a time back. */
export function timeText(hour: number, minute: number): string {
  const half = hour < 12 ? 'am' : 'pm';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${half}`;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** An instant, as the clock on the wall reads it in `zone`. */
export function wallClock(iso: string, zone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

/**
 * Resolve a wall time by checking the offsets on either side of the date.
 * A spring gap has no matching instant; an autumn repeat uses the first one.
 */
export function wallTimeToIso(
  date: { year: number; month: number; day: number },
  time: TimeOfDay,
  zone: string,
): string | null {
  const target = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute);
  const offsets = new Set<number>();
  for (const delta of [-86400000, 0, 86400000]) {
    const instant = target + delta;
    const w = wallClock(new Date(instant).toISOString(), zone);
    offsets.add(Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - instant);
  }
  const candidates = [...offsets].map((offset) => target - offset).sort((a, b) => a - b);
  for (const candidate of candidates) {
    const iso = new Date(candidate).toISOString();
    const w = wallClock(iso, zone);
    if (
      w.year === date.year &&
      w.month === date.month &&
      w.day === date.day &&
      w.hour === time.hour &&
      w.minute === time.minute
    )
      return iso;
  }
  return null;
}

/* ---------------------------------------------------------------- links */

/**
 * A link as somebody pasted or typed it. "norcalsci.org/picnic" is given its
 * https:// rather than refused; anything that is not a web address is refused,
 * because the database will refuse it too.
 */
export function readLink(text: string): { ok: true; url: string } | { ok: false } {
  const t = text.trim();
  if (!t) return { ok: true, url: '' };
  if (/^https?:\/\/\S+$/i.test(t)) return { ok: true, url: t };
  if (/^[^\s:/]+\.[^\s]+$/.test(t) && !/^[a-z][a-z0-9+.-]*:/i.test(t)) {
    return { ok: true, url: `https://${t}` };
  }
  return { ok: false };
}

/* ---------------------------------------------------------------- reading */

export type DraftReading =
  | { ok: true; payload: Omit<EventDraftPayload, 'id'> }
  | { ok: false; problem: string };

/**
 * What the form would save, or the first thing still missing, in the order
 * the form asks. `isNew`: a new event cannot start in the past, where a change
 * to one that has happened (a typo in last week's) can.
 */
export function readDraft(
  draft: EventDraft,
  { isNew, now = new Date() }: { isNew: boolean; now?: Date },
): DraftReading {
  if (!draft.host) return { ok: false, problem: 'Choose who is hosting it.' };
  const organizationId = draft.host === NO_ORGANIZATION ? null : draft.host;
  if (!organizationId && !draft.hostName.trim()) {
    return { ok: false, problem: 'Say who is hosting it.' };
  }
  if (!draft.title.trim()) return { ok: false, problem: 'Give the event a name.' };

  const date = readDate(draft.date, { needs: 'day', now, future: true });
  if (date.kind === 'empty') return { ok: false, problem: 'Add the date.' };
  if (date.kind === 'partial') return { ok: false, problem: date.need };
  if (date.kind === 'invalid') return { ok: false, problem: date.problem };
  const [year, month, day] = date.iso.split('-').map(Number) as [number, number, number];

  const start = readTime(draft.startTime);
  if (start.kind === 'empty') return { ok: false, problem: 'Add the time it starts.' };
  if (start.kind === 'invalid') return { ok: false, problem: `Starts: ${start.problem}` };
  const end = readTime(draft.endTime);
  if (end.kind === 'invalid') return { ok: false, problem: `Ends: ${end.problem}` };

  const startTime = wallTimeToIso({ year, month, day }, start.time, HAND_ADDED_TIMEZONE);
  if (!startTime)
    return {
      ok: false,
      problem:
        'Starts: that time does not exist because the clocks move forward. Choose another time.',
    };
  let endTime: string | null = null;
  if (end.kind === 'time') {
    const startMinutes = start.time.hour * 60 + start.time.minute;
    const endMinutes = end.time.hour * 60 + end.time.minute;
    if (endMinutes === startMinutes) {
      return { ok: false, problem: 'It has to end after it starts.' };
    }
    // Earlier on the clock than the start is the small hours of the next day:
    // a 9 pm to 1 am evening, not an event that ends before it begins.
    const endDay = new Date(Date.UTC(year, month - 1, day + (endMinutes < startMinutes ? 1 : 0)));
    endTime = wallTimeToIso(
      { year: endDay.getUTCFullYear(), month: endDay.getUTCMonth() + 1, day: endDay.getUTCDate() },
      end.time,
      HAND_ADDED_TIMEZONE,
    );
    if (!endTime)
      return {
        ok: false,
        problem:
          'Ends: that time does not exist because the clocks move forward. Choose another time.',
      };
  }
  if (isNew && new Date(startTime) < now) {
    return { ok: false, problem: 'That time has already passed.' };
  }

  if (!draft.format)
    return { ok: false, problem: 'Say whether it is in person, online or hybrid.' };
  if (draft.format !== 'online' && !draft.location.trim()) {
    return { ok: false, problem: 'Say where it is.' };
  }

  const url = readLink(draft.url);
  const registration = readLink(draft.registrationUrl);
  if (!url.ok || !registration.ok) {
    return { ok: false, problem: 'A link has to be a web address, like https://norcalsci.org.' };
  }

  return {
    ok: true,
    payload: {
      organizationId,
      hostName: organizationId ? '' : draft.hostName.trim(),
      title: draft.title.trim(),
      description: draft.description.trim(),
      startTime,
      endTime,
      format: draft.format,
      location: draft.location.trim(),
      city: draft.city.trim(),
      url: url.url,
      registrationUrl: registration.url,
    },
  };
}
