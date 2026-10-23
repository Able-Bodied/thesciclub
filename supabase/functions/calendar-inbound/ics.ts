/**
 * Reading a calendar invitation (iCalendar, RFC 5545) the way the club needs
 * it: one event, its times in UTC, and a repeat the club's own repeating
 * events can carry (20261011050000). Google, Outlook and Apple Calendar all
 * attach one of these to an invitation.
 *
 * Pure: no network, no clock, so it is tested on its own (ics.test.ts).
 */

import { type Format, whereOf } from './place.ts';

export interface RepeatRule {
  unit: 'day' | 'week' | 'month';
  /** Every this many days, weeks or months; 1 to 30. */
  every: number;
  /** The last day it may fall on, YYYY-MM-DD in the event's own zone. */
  endsOn: string | null;
  /** How many dates in all, 2 to 100. */
  endsAfter: number | null;
}

export interface InviteEvent {
  uid: string;
  sequence: number;
  /** REQUEST (new or changed), CANCEL, or whatever else the file said. */
  method: string;
  cancelled: boolean;
  /** One date of a repeating event, when the file is about only that date. */
  recurrenceId: string | null;
  title: string;
  description: string;
  /** The physical place only; links are taken out (place.ts). */
  location: string;
  /** The meeting link, else the invitation's own URL. */
  url: string | null;
  format: Format | null;
  /** From a US address only. */
  city: string | null;
  state: string | null;
  /** ISO, UTC. */
  starts: string;
  ends: string | null;
  allDay: boolean;
  /** IANA, e.g. America/Los_Angeles. */
  timezone: string;
  repeat: RepeatRule | null;
  /** Set when the invite repeats in a way the club cannot: only its first date is added. */
  repeatNote: string | null;
}

/** The club's own zone, for an invite that names none it can read. */
export const DEFAULT_ZONE = 'America/Los_Angeles';

/** Outlook writes Windows zone names. The ones the club's members are in. */
const WINDOWS_ZONES: Record<string, string> = {
  'Pacific Standard Time': 'America/Los_Angeles',
  'Pacific Daylight Time': 'America/Los_Angeles',
  'Mountain Standard Time': 'America/Denver',
  'US Mountain Standard Time': 'America/Phoenix',
  'Central Standard Time': 'America/Chicago',
  'Eastern Standard Time': 'America/New_York',
  'US Eastern Standard Time': 'America/Indiana/Indianapolis',
  'Alaskan Standard Time': 'America/Anchorage',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'Atlantic Standard Time': 'America/Halifax',
  'GMT Standard Time': 'Europe/London',
  'W. Europe Standard Time': 'Europe/Berlin',
  UTC: 'UTC',
  'Coordinated Universal Time': 'UTC',
};

interface Property {
  name: string;
  params: Record<string, string>;
  value: string;
}

interface Component {
  type: string;
  properties: Property[];
  children: Component[];
}

/** Lines folded with a leading space or tab are one line (RFC 5545 3.1). */
function unfold(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
    .filter((line) => line.length > 0);
}

function parseLine(line: string): Property | null {
  // The name and its parameters end at the first colon outside quotes.
  let inQuotes = false;
  let split = -1;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ':' && !inQuotes) {
      split = i;
      break;
    }
  }
  if (split < 0) return null;
  const head = line.slice(0, split);
  const value = line.slice(split + 1);
  const [rawName = '', ...rawParams] = head.split(';');
  const params: Record<string, string> = {};
  for (const param of rawParams) {
    const eq = param.indexOf('=');
    if (eq < 0) continue;
    params[param.slice(0, eq).toUpperCase()] = param.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: rawName.toUpperCase(), params, value };
}

function parseComponents(text: string): Component {
  const root: Component = { type: 'ROOT', properties: [], children: [] };
  const stack: Component[] = [root];
  for (const line of unfold(text)) {
    const property = parseLine(line);
    if (!property) continue;
    const top = stack[stack.length - 1];
    if (!top) break;
    if (property.name === 'BEGIN') {
      const child: Component = { type: property.value.toUpperCase(), properties: [], children: [] };
      top.children.push(child);
      stack.push(child);
    } else if (property.name === 'END') {
      if (stack.length > 1) stack.pop();
    } else {
      top.properties.push(property);
    }
  }
  return root;
}

function find(component: Component, name: string): Property | undefined {
  return component.properties.find((p) => p.name === name);
}

/** TEXT values escape commas, semicolons, backslashes and newlines (3.3.11). */
function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, ch: string) => (ch === 'n' || ch === 'N' ? '\n' : ch));
}

/** The zone a TZID names, as IANA, or the club's own when it cannot be read. */
export function ianaZone(tzid: string | undefined): string {
  if (!tzid) return DEFAULT_ZONE;
  const named = WINDOWS_ZONES[tzid] ?? tzid.replace(/^\/[^/]+\/[^/]+\//, '');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: named });
    return named;
  } catch {
    return DEFAULT_ZONE;
  }
}

function zoneOffsetMs(utcMs: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - utcMs;
}

/** A wall-clock time in a zone, as UTC milliseconds. */
export function wallTimeToUtc(
  wall: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  zone: string,
): number {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const first = guess - zoneOffsetMs(guess, zone);
  // Once more, for a time near a daylight-saving change.
  return guess - zoneOffsetMs(first, zone);
}

interface ReadTime {
  utcMs: number;
  allDay: boolean;
  zone: string;
}

function readTime(property: Property | undefined, fallbackZone: string): ReadTime | null {
  if (!property) return null;
  const value = property.value.trim();
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (date || property.params.VALUE === 'DATE') {
    const [, y, m, d] = date ?? /^(\d{4})(\d{2})(\d{2})/.exec(value) ?? [];
    if (!y || !m || !d) return null;
    const zone = property.params.TZID ? ianaZone(property.params.TZID) : fallbackZone;
    return {
      utcMs: wallTimeToUtc({ year: +y, month: +m, day: +d, hour: 0, minute: 0, second: 0 }, zone),
      allDay: true,
      zone,
    };
  }
  const time = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!time) return null;
  const [, y = '', m = '', d = '', hh = '', mm = '', ss = '', z] = time;
  const wall = { year: +y, month: +m, day: +d, hour: +hh, minute: +mm, second: +ss };
  if (z === 'Z') {
    return {
      utcMs: Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second),
      allDay: false,
      zone: property.params.TZID ? ianaZone(property.params.TZID) : fallbackZone,
    };
  }
  const zone = property.params.TZID ? ianaZone(property.params.TZID) : fallbackZone;
  return { utcMs: wallTimeToUtc(wall, zone), allDay: false, zone };
}

/** YYYY-MM-DD of a UTC instant in a zone. */
function dateIn(utcMs: number, zone: string): string {
  return new Date(utcMs).toLocaleDateString('en-CA', { timeZone: zone });
}

/** SU, MO, … of a UTC instant in a zone, as an RRULE writes it. */
function weekdayIn(utcMs: number, zone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short' })
    .format(new Date(utcMs))
    .slice(0, 2)
    .toUpperCase();
}

/**
 * An RRULE as the club's repeat: daily, weekly on the first date's weekday,
 * or monthly on the same weekday of the month (the second Friday), every 1
 * to 30, ending on a date or after 2 to 100 times, or never. Anything else
 * the club cannot repeat, and says so.
 */
export function readRepeat(
  rrule: string,
  start: ReadTime,
): { repeat: RepeatRule | null; note: string | null } {
  const parts: Record<string, string> = {};
  for (const piece of rrule.split(';')) {
    const eq = piece.indexOf('=');
    if (eq > 0) parts[piece.slice(0, eq).toUpperCase()] = piece.slice(eq + 1).toUpperCase();
  }
  const cannot = {
    repeat: null,
    note: 'It repeats in a way the club cannot, so only its first date is added.',
  };
  const unit =
    parts.FREQ === 'DAILY'
      ? 'day'
      : parts.FREQ === 'WEEKLY'
        ? 'week'
        : parts.FREQ === 'MONTHLY'
          ? 'month'
          : null;
  if (!unit) return cannot;
  if (parts.BYMONTHDAY || parts.BYSETPOS || parts.BYMONTH || parts.BYHOUR) return cannot;

  const weekday = weekdayIn(start.utcMs, start.zone);
  if (unit === 'week' && parts.BYDAY && parts.BYDAY !== weekday) return cannot;
  if (unit === 'day' && parts.BYDAY) return cannot;
  if (unit === 'month') {
    // Monthly, only on the same weekday of the month as the first date.
    const day = Number(dateIn(start.utcMs, start.zone).slice(8, 10));
    const nth = Math.ceil(day / 7);
    if (parts.BYDAY !== `${nth}${weekday}`) return cannot;
  }

  const every = parts.INTERVAL ? Number(parts.INTERVAL) : 1;
  if (!Number.isInteger(every) || every < 1 || every > 30) return cannot;

  let endsOn: string | null = null;
  let endsAfter: number | null = null;
  if (parts.COUNT) {
    const count = Number(parts.COUNT);
    if (!Number.isInteger(count) || count < 2) return { repeat: null, note: null };
    endsAfter = Math.min(count, 100);
  } else if (parts.UNTIL) {
    const until = readTime({ name: 'UNTIL', params: {}, value: parts.UNTIL }, start.zone);
    if (!until) return cannot;
    endsOn = dateIn(until.utcMs, start.zone);
    if (endsOn <= dateIn(start.utcMs, start.zone)) return { repeat: null, note: null };
  }
  return { repeat: { unit, every, endsOn, endsAfter }, note: null };
}

/**
 * A description as words: Google's footer ("Invitation from Google Calendar"
 * and its join links, set off by -::~:~::~ lines) and any HTML taken out.
 */
export function cleanDescription(raw: string): string {
  let text = raw;
  const footer = text.indexOf('-::~:~::~');
  if (footer >= 0) text = text.slice(0, footer);
  if (/<[a-z][\s\S]*>/i.test(text)) {
    text = text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 4000);
}

/**
 * The invite's event. With several, the one that is the whole event (no
 * RECURRENCE-ID) wins; a file about one date of a repeating event gives that
 * date. Null when there is no event the club can read.
 */
export function readInvite(text: string): InviteEvent | null {
  const root = parseComponents(text);
  const calendar = root.children.find((c) => c.type === 'VCALENDAR');
  if (!calendar) return null;
  const method = (find(calendar, 'METHOD')?.value ?? 'REQUEST').trim().toUpperCase();
  const events = calendar.children.filter((c) => c.type === 'VEVENT');
  const event = events.find((e) => !find(e, 'RECURRENCE-ID')) ?? events[0];
  if (!event) return null;

  const uid = find(event, 'UID')?.value.trim();
  if (!uid) return null;
  const fallbackZone = DEFAULT_ZONE;
  const start = readTime(find(event, 'DTSTART'), fallbackZone);
  if (!start) return null;
  let end = readTime(find(event, 'DTEND'), start.zone);
  if (!end) {
    const duration = find(event, 'DURATION')?.value.trim();
    const match = duration ? /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(duration) : null;
    if (match) {
      const ms =
        (Number(match[1] ?? 0) * 24 * 60 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)) *
        60000;
      if (ms > 0) end = { utcMs: start.utcMs + ms, allDay: start.allDay, zone: start.zone };
    }
  }
  const recurrence = readTime(find(event, 'RECURRENCE-ID'), start.zone);
  const rrule = find(event, 'RRULE')?.value;
  const { repeat, note } =
    rrule && !recurrence ? readRepeat(rrule, start) : { repeat: null, note: null };
  const url = find(event, 'URL')?.value.trim() ?? null;
  const prop = (name: string) => unescapeText(find(event, name)?.value ?? '');
  const where = whereOf({
    location: prop('LOCATION'),
    url: url && /^https?:\/\/\S+$/i.test(url) ? url : null,
    conference: [
      'X-GOOGLE-CONFERENCE',
      'X-MICROSOFT-SKYPETEAMSMEETINGURL',
      'X-MICROSOFT-ONLINEMEETINGEXTERNALLINK',
      'X-MICROSOFT-ONLINEMEETINGCONFLINK',
    ].map(prop),
    description: `${prop('DESCRIPTION')}\n${prop('X-ALT-DESC')}`,
  });
  const status = find(event, 'STATUS')?.value.trim().toUpperCase();

  return {
    uid,
    sequence: Number(find(event, 'SEQUENCE')?.value ?? 0) || 0,
    method,
    cancelled: method === 'CANCEL' || status === 'CANCELLED',
    recurrenceId: recurrence ? new Date(recurrence.utcMs).toISOString() : null,
    title: unescapeText(find(event, 'SUMMARY')?.value ?? '')
      .trim()
      .slice(0, 140),
    description: cleanDescription(
      unescapeText(find(event, 'X-ALT-DESC')?.value ?? find(event, 'DESCRIPTION')?.value ?? ''),
    ),
    location: where.place,
    url: where.link,
    format: where.format,
    city: where.city,
    state: where.state,
    starts: new Date(start.utcMs).toISOString(),
    // An all-day event's DTEND is the next day: the club keeps no end for it.
    ends:
      end && !start.allDay && end.utcMs > start.utcMs ? new Date(end.utcMs).toISOString() : null,
    allDay: start.allDay,
    timezone: start.zone,
    repeat,
    repeatNote: note,
  };
}
