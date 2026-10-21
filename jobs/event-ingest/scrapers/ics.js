/**
 * Reading iCalendar (.ics) files, and expanding their repeating events.
 *
 * Only what the club's feeds use (2026-10-20): VEVENTs with DTSTART/DTEND in
 * a TZID, in UTC or as dates; RRULE with FREQ DAILY, WEEKLY or MONTHLY,
 * INTERVAL, UNTIL, COUNT, BYDAY (weekdays, or "3MO", "-1FR" in a month) and
 * BYMONTHDAY; EXDATE; and RECURRENCE-ID for one changed occurrence. A rule
 * outside that is not guessed at: the event is kept as its first occurrence
 * and the caller is told.
 */

import { zonedParts, zonedPartsToUtc } from './timezone.js';

const DAY_MS = 86_400_000;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function unescapeText(value) {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\([,;\\])/g, '$1')
    .trim();
}

/** "DTSTART;TZID=America/New_York:20240516T140000" → { name, params, value }. */
function parseLine(line) {
  const colon = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...rest] = head.split(';');
  const params = Object.fromEntries(
    rest.map((p) => {
      const eq = p.indexOf('=');
      return [p.slice(0, eq).toUpperCase(), p.slice(eq + 1).replace(/^"|"$/g, '')];
    }),
  );
  return { name: name.toUpperCase(), params, value };
}

/**
 * A date-time property as { day, minutes, zone, utc, dateOnly }: the wall
 * clock and the zone it is read in. `fallbackZone` is the calendar's own
 * (X-WR-TIMEZONE) for a floating time.
 */
function parseWhen({ params, value }, fallbackZone) {
  const m = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  return {
    day: `${y}-${mo}-${d}`,
    minutes: h ? Number(h) * 60 + Number(mi) : 0,
    zone: z ? 'UTC' : (params.TZID ?? fallbackZone),
    dateOnly: params.VALUE === 'DATE' || !h,
  };
}

/** A parsed when, as an instant. */
export function instantOf(when) {
  const [year, month, day] = when.day.split('-').map(Number);
  const parts = {
    year,
    month,
    day,
    hour: Math.floor(when.minutes / 60),
    minute: when.minutes % 60,
    second: 0,
  };
  if (when.zone === 'UTC') {
    return new Date(Date.UTC(year, month - 1, day, parts.hour, parts.minute));
  }
  return zonedPartsToUtc(parts, when.zone);
}

/** Every VEVENT in an .ics text, unexpanded. */
export function parseIcs(text, defaultZone = 'America/Los_Angeles') {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
  const calendarZone =
    lines.map((l) => /^X-WR-TIMEZONE:(.+)$/i.exec(l)?.[1]?.trim()).find(Boolean) ?? defaultZone;
  const events = [];
  let current = null;
  for (const raw of lines) {
    if (raw === 'BEGIN:VEVENT') {
      current = { exdates: [] };
      continue;
    }
    if (raw === 'END:VEVENT') {
      if (current?.start) events.push(current);
      current = null;
      continue;
    }
    if (!current || !raw.includes(':')) continue;
    const prop = parseLine(raw);
    switch (prop.name) {
      case 'UID':
        current.uid = prop.value.trim();
        break;
      case 'SUMMARY':
        current.summary = unescapeText(prop.value);
        break;
      case 'DESCRIPTION':
        current.description = unescapeText(prop.value);
        break;
      case 'LOCATION':
        current.location = unescapeText(prop.value);
        break;
      case 'URL':
        current.url = prop.value.trim();
        break;
      case 'DTSTART':
        current.start = parseWhen(prop, calendarZone);
        break;
      case 'DTEND':
        current.end = parseWhen(prop, calendarZone);
        break;
      case 'RRULE':
        current.rrule = Object.fromEntries(
          prop.value.split(';').map((part) => part.split('=').map((s) => s.trim())),
        );
        break;
      case 'EXDATE':
        for (const v of prop.value.split(',')) {
          const when = parseWhen({ params: prop.params, value: v }, calendarZone);
          if (when) current.exdates.push(when.day);
        }
        break;
      case 'RECURRENCE-ID':
        current.recurrenceDay = parseWhen(prop, calendarZone)?.day ?? null;
        break;
      case 'STATUS':
        current.status = prop.value.trim().toUpperCase();
        break;
      default:
        break;
    }
  }
  return events;
}

const toDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (day) => Date.parse(`${day}T00:00:00Z`);
const weekdayOf = (day) => new Date(dayMs(day)).getUTCDay();

/** The days in a month (`YYYY-MM`) a monthly BYDAY like "3MO" or "-1FR" names. */
function nthWeekdays(year, month, byday) {
  const days = [];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (const spec of byday) {
    const m = /^([+-]?\d)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(spec);
    if (!m) return null;
    const wd = WEEKDAYS.indexOf(m[2]);
    const matches = [];
    for (let d = 1; d <= last; d++) {
      if (new Date(Date.UTC(year, month - 1, d)).getUTCDay() === wd) matches.push(d);
    }
    const n = m[1] ? Number(m[1]) : 0;
    const picked = n === 0 ? matches : [n > 0 ? matches[n - 1] : matches[matches.length + n]];
    for (const d of picked) if (d) days.push(d);
  }
  return days.sort((a, b) => a - b);
}

/**
 * The days a repeating event falls on, from its first through `untilDay`.
 * Null when the rule uses something this does not read.
 */
export function occurrenceDays(event, untilDay) {
  const rule = event.rrule;
  const first = event.start.day;
  if (!rule) return [first];
  const freq = rule.FREQ;
  const interval = Math.max(1, Number(rule.INTERVAL ?? 1));
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
  const ruleEnd = rule.UNTIL
    ? `${rule.UNTIL.slice(0, 4)}-${rule.UNTIL.slice(4, 6)}-${rule.UNTIL.slice(6, 8)}`
    : null;
  const stop = ruleEnd && ruleEnd < untilDay ? ruleEnd : untilDay;
  const byday = rule.BYDAY ? rule.BYDAY.split(',') : null;
  const supported = new Set(['FREQ', 'INTERVAL', 'UNTIL', 'COUNT', 'BYDAY', 'BYMONTHDAY', 'WKST']);
  if (Object.keys(rule).some((key) => !supported.has(key))) return null;

  const out = [];
  const push = (day) => {
    if (day >= first && day <= stop && out.length < count) out.push(day);
  };

  if (freq === 'DAILY') {
    for (let ms = dayMs(first); toDay(ms) <= stop && out.length < count; ms += interval * DAY_MS)
      push(toDay(ms));
  } else if (freq === 'WEEKLY') {
    const days = byday ? byday.map((d) => WEEKDAYS.indexOf(d)) : [weekdayOf(first)];
    if (days.some((d) => d < 0)) return null;
    const weekStart = dayMs(first) - weekdayOf(first) * DAY_MS;
    for (
      let week = weekStart;
      toDay(week) <= stop && out.length < count;
      week += interval * 7 * DAY_MS
    ) {
      for (const d of [...days].sort((a, b) => a - b)) push(toDay(week + d * DAY_MS));
    }
  } else if (freq === 'MONTHLY') {
    let [y, m] = first.split('-').map(Number);
    while (`${y}-${String(m).padStart(2, '0')}-01` <= stop && out.length < count) {
      const days = byday
        ? nthWeekdays(y, m, byday)
        : [Number(rule.BYMONTHDAY ?? first.slice(8, 10))];
      if (!days) return null;
      for (const d of days) {
        if (d <= new Date(Date.UTC(y, m, 0)).getUTCDate()) {
          push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
        }
      }
      m += interval;
      while (m > 12) {
        m -= 12;
        y += 1;
      }
    }
  } else {
    return null;
  }
  const skipped = new Set(event.exdates);
  return out.filter((day) => !skipped.has(day));
}

/**
 * Every occurrence from `fromDay` to `untilDay`, as { event, day, start, end }
 * instants. A changed occurrence (RECURRENCE-ID) replaces the one it changes.
 * `onUnsupported` hears about a rule kept as its first occurrence only.
 */
export function expandIcs(events, fromDay, untilDay, onUnsupported = () => {}) {
  const changed = new Map();
  for (const e of events) {
    if (e.recurrenceDay) changed.set(`${e.uid}|${e.recurrenceDay}`, e);
  }
  const out = [];
  for (const event of events) {
    if (event.recurrenceDay || event.status === 'CANCELLED') continue;
    let days = occurrenceDays(event, untilDay);
    if (!days) {
      onUnsupported(event);
      days = [event.start.day];
    }
    const length = event.end
      ? instantOf(event.end).getTime() - instantOf(event.start).getTime()
      : null;
    for (const day of days) {
      const which = changed.get(`${event.uid}|${day}`) ?? event;
      if (which.status === 'CANCELLED') continue;
      const when = which === event ? { ...event.start, day } : which.start;
      if (when.day < fromDay || when.day > untilDay) continue;
      const start = instantOf(when);
      const end =
        which === event
          ? length === null
            ? null
            : new Date(start.getTime() + length)
          : which.end
            ? instantOf(which.end)
            : null;
      // An all-day event ends at its last day's 23:59 (events.all_day), not at
      // the next midnight .ics gives as its exclusive end.
      const allDayEnd = when.dateOnly && end ? new Date(end.getTime() - 60_000) : end;
      out.push({ event: which, day, start, end: allDayEnd });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export { zonedParts };
