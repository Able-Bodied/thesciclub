import { SITE_ORIGIN } from '@/lib/site-origin';
import { eventMeetingLink } from '@/routes/events/event-meeting-link';
import { descriptionText } from '@/routes/events/rich-text';
import type { ClubEvent } from '@/types/domain';

/**
 * An event for the member's own calendar (the owner, 2026-10-27): a Google
 * Calendar link, and an .ics file for Apple Calendar, Outlook and the rest.
 * Made here from the event as the page has it; nothing is sent anywhere.
 *
 * An event with no end lasts an hour. An all-day one is a run of whole days on
 * its own calendar, ending the day after its last (both formats' convention).
 */

export type CalendarEvent = Pick<
  ClubEvent,
  | 'id'
  | 'title'
  | 'description'
  | 'descriptionHtml'
  | 'startTime'
  | 'endTime'
  | 'timezone'
  | 'allDay'
  | 'location'
  | 'city'
  | 'state'
  | 'url'
>;

const HOUR_MS = 3_600_000;
/** Enough to know what it is; the page link has the rest. */
const DETAILS_MAX = 600;

function utcStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** The day an instant falls on in a zone, as 20261027. */
function dayIn(iso: string, timezone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}${parts.month}${parts.day}`;
}

function dayAfter(day: string): string {
  const next = new Date(
    Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)) + 1),
  );
  return next.toISOString().slice(0, 10).replace(/-/g, '');
}

/** Start and end in the formats' own shape: whole days, or UTC instants. */
export function calendarDates(event: CalendarEvent): {
  start: string;
  end: string;
  allDay: boolean;
} {
  if (event.allDay) {
    const first = dayIn(event.startTime, event.timezone);
    const last = event.endTime ? dayIn(event.endTime, event.timezone) : first;
    return { start: first, end: dayAfter(last < first ? first : last), allDay: true };
  }
  const start = new Date(event.startTime);
  const end = event.endTime ? new Date(event.endTime) : null;
  const finish = end && end > start ? end : new Date(start.getTime() + HOUR_MS);
  return { start: utcStamp(start), end: utcStamp(finish), allDay: false };
}

/** The meeting link for an online event, else the place as a map would search it. */
export function calendarLocation(event: CalendarEvent): string {
  const meeting = eventMeetingLink(event);
  const place = event.location.replace(/\s+/g, ' ').trim();
  const area = [event.city?.trim(), event.state?.trim()].filter(Boolean).join(', ');
  const where =
    place && area && !place.toLowerCase().includes((event.city ?? '').trim().toLowerCase())
      ? `${place}, ${area}`
      : place || area;
  if (meeting && !where) return meeting.href;
  return where;
}

/** What the calendar entry says: the start of the description, the call link, the page. */
export function calendarDetails(event: CalendarEvent): string {
  let text = descriptionText(event.descriptionHtml, event.description);
  if (text.length > DETAILS_MAX) text = `${text.slice(0, DETAILS_MAX).trimEnd()}…`;
  const meeting = eventMeetingLink(event);
  return [
    text,
    meeting ? `Join online: ${meeting.href}` : '',
    `On The SCI Club: ${SITE_ORIGIN}/events/${event.id}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const { start, end } = calendarDates(event);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${start}/${end}`,
    details: calendarDetails(event),
    location: calendarLocation(event),
  });
  if (!event.allDay) params.set('ctz', event.timezone);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function icsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Lines of at most 75 octets, continued with a space (RFC 5545 3.1). */
function fold(line: string): string {
  const bytes = new TextEncoder();
  const out: string[] = [];
  let current = '';
  for (const char of line) {
    const limit = out.length === 0 ? 75 : 74;
    if (bytes.encode(current + char).length > limit) {
      out.push(current);
      current = char;
    } else current += char;
  }
  out.push(current);
  return out.join('\r\n ');
}

export function icsFor(event: CalendarEvent, now: Date = new Date()): string {
  const { start, end, allDay } = calendarDates(event);
  const location = calendarLocation(event);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The SCI Club//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@thesciclub.com`,
    `DTSTAMP:${utcStamp(now)}`,
    allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`,
    allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND:${end}`,
    `SUMMARY:${icsText(event.title)}`,
    location ? `LOCATION:${icsText(location)}` : '',
    `DESCRIPTION:${icsText(calendarDetails(event))}`,
    `URL:${SITE_ORIGIN}/events/${event.id}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** Hands the browser the .ics file; the phone or computer offers its calendar. */
export function downloadIcs(event: CalendarEvent): void {
  const blob = new Blob([icsFor(event)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${event.title.replace(/[^\w -]+/g, '').trim() || 'event'}.ics`;
  link.click();
  // Later than the click: Safari reads the file after this returns.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}
