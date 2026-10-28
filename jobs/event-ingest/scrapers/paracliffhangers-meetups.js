/**
 * ParaCliffHangers' indoor climbing meetups, from its Indoor page
 * (feed_url). Each region is an accordion item of lines: "Berkeley, CA",
 * "Location: Berkeley Ironworks", "Dates: Fridays | 6PM - 9PM", a sign-up
 * link, and the region's chapter emails.
 *
 * A schedule is a rule, not a list, so the dates are made here, 92 days
 * ahead as a club series' are (20261011050000), in the chapter's own zone,
 * and the nightly run moves the horizon on. Not an event_series row: those
 * are hand-made, Pacific and one weekday a month, and the page has "1st and
 * 3rd Mondays", "Last Sundays" and Eastern and Central chapters. The run is
 * complete, so a date the page stops giving is removed (ingest.js).
 *
 * Anything not read for certain makes no dates and a warning naming it.
 */

import * as cheerio from 'cheerio';
import { addDays, dayIn, fetchText, joinPlace } from './http.js';
import { nearestYear, parseMonthDay } from './naturetrack-trax.js';
import { convertRichText } from './rich-text.js';
import { zonedPartsToUtc } from './timezone.js';
import { stateCode, zoneOfPlace } from './us-zones.js';

export const PAGE_URL = 'https://www.paracliffhangers.org/indoor';

/**
 * Each gym's street, by the page's city and gym name: from ParaCliffHangers'
 * own map links or the gym's own site, checked by the owner (2026-10-28),
 * spelled as OpenStreetMap finds it ("373 US 46"). A gym not here is placed
 * by its name and city, as before.
 */
const GYMS = new Map(
  [
    ['Berkeley', 'Berkeley Ironworks', 'Berkeley Ironworks', '800 Potter St', '94710'],
    ['Concord', 'Diablo Rock Gym', 'Diablo Rock Gym', '1220 Diamond Way', '94520'],
    ['Oakland', 'Pacific Pipe', 'Pacific Pipe', '2140 Mandela Pkwy', '94607'],
    ['San Francisco', 'Movement San Francisco', 'Movement San Francisco', '924 Mason St', '94129'],
    ['Sunnyvale', 'Movement Sunnyvale', 'Movement Sunnyvale', '815 Stewart Dr', '94085'],
    ['Pasadena', 'The Post', 'The Post', '1100 N Fair Oaks Ave', '91103'],
    [
      'San Diego',
      'Mesa Rim Mission Valley',
      'Mesa Rim Mission Valley',
      '405 Camino del Rio S',
      '92108',
    ],
    ['San Marcos', 'Mesa Rim North City', 'Mesa Rim North City', '285 Industrial St', '92078'],
    ['Tampa', 'Central Rock Gym Tampa', 'Central Rock Gym Tampa', '4479 W Gandy Blvd', '33611'],
    ['St. Petersburg', 'Vertical Ventures', 'Vertical Ventures', '116 18th St S', '33712'],
    ['DeLand', 'DynoClimb', 'DynoClimb', '528 S Woodland Blvd', '32720'],
    ['Fairfield', 'NJ Rock Gym', 'NJ Rock Gym', '373 US 46', '07004'],
    ['Brooklyn', 'Movement Gowanus', 'Movement Gowanus', '242 Butler St', '11217'],
    ['Long Island City', 'Movement LIC', 'Movement LIC', '11-11 44th Dr', '11101'],
    [
      'Manhattan',
      'Central Rock Gym Manhattan',
      'Central Rock Gym Manhattan',
      '21 West End Ave',
      '10069',
    ],
    ['Buffalo', 'Central Rock Gym - Buffalo', 'Central Rock Gym Buffalo', '55 Chicago St', '14204'],
    [
      'Durham',
      'Triangle Rock Club Durham',
      'Triangle Rock Club Durham',
      '1010 Martin Luther King Jr Pkwy',
      '27713',
    ],
    ['Pittsburgh', 'Ascend', 'ASCEND Point Breeze', '7443 Thomas Blvd', '15208'],
    ['Arlington', 'Dyno Gym', 'Dyno-Rock', '608 E Front St', '76011'],
  ].map(([city, gym, name, street, zip]) => [
    `${city}|${gym}`.toLowerCase(),
    { name, street, zip },
  ]),
);

/** Where a meetup is: its gym's name and street when known, else its name. */
export function meetupPlace(gym, city, state) {
  const known = gym ? GYMS.get(`${city}|${gym}`.toLowerCase()) : undefined;
  if (!known) return joinPlace(gym, city, state);
  return joinPlace(known.name, known.street, city, `${state} ${known.zip}`);
}
const DAYS = 92;

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEKDAY = '(sun|mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?)(?:day)?';
const ORDINALS = {
  '1st': 1,
  first: 1,
  '2nd': 2,
  second: 2,
  '3rd': 3,
  third: 3,
  '4th': 4,
  fourth: 4,
  '5th': 5,
  fifth: 5,
  last: -1,
};
const ORDINAL = `(?:${Object.keys(ORDINALS).join('|')})`;

const EMAIL = '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}';
const HEADER = /^([A-Z][A-Za-z.'’ -]*?),\s*([A-Z]{2})\b\s*(?:[-–—]\s*(.+?))?$/;
const CONTACT = new RegExp(`^(?:([A-Za-z][A-Za-z .'-]*):\\s*)?(${EMAIL})$`, 'i');
const LOCATION = /^location:\s*(.*)$/i;
const DATES = /^(?:upcoming\s+)?dates?:\s*(.*)$/i;
const LINK_LINE = /^(?:sign[ -]?up:?\s*)?(https?:\/\/\S+)$/i;

/** Spaces as one, no zero-width joiners (the page ends a link with one). */
const clean = (text) =>
  (text ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function webLink(href) {
  try {
    const url = new URL(clean(href));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A block as lines, each with the links in it: `<br>` and blocks end a line. */
export function linesOf($, root) {
  const lines = [];
  let line = { text: '', links: [] };
  const end = () => {
    const text = clean(line.text);
    if (text) lines.push({ text, links: line.links });
    line = { text: '', links: [] };
  };
  const walk = (node) => {
    if (node.type === 'text') {
      line.text += node.data;
      return;
    }
    if (node.type !== 'tag') return;
    const name = node.name.toLowerCase();
    if (name === 'br') return end();
    const block = /^(p|div|li|ul|ol|h[1-6])$/.test(name);
    if (block) end();
    if (name === 'a') {
      const text = clean($(node).text());
      const href = $(node).attr('href') ?? '';
      if (text) line.links.push({ text, href: clean(href) });
    }
    for (const child of node.children ?? []) walk(child);
    if (block) end();
  };
  for (const child of $(root).contents().toArray()) walk(child);
  end();
  return lines;
}

/** "6PM - 9PM", "6:30-8:30pm", "10 AM- 12 PM", "5-7pm" → minutes from midnight. */
export function parseTimeRange(text) {
  const all = [
    ...(text ?? '').matchAll(
      /(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?\s*m?\.?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\b\.?/gi,
    ),
  ];
  if (all.length !== 1) return null;
  const [match] = all;
  const [, h1, m1 = '0', a1, h2, m2 = '0', a2] = match;
  if (Number(h1) < 1 || Number(h1) > 12 || Number(h2) < 1 || Number(h2) > 12) return null;
  if (Number(m1) > 59 || Number(m2) > 59) return null;
  const at = (hour, minute, meridiem) =>
    (Number(hour) % 12) * 60 + (/p/i.test(meridiem) ? 720 : 0) + Number(minute);
  const end = at(h2, m2, a2);
  let start = at(h1, m1, a1 ?? a2);
  // "11-1pm" is eleven in the morning.
  if (!a1 && start >= end && /p/i.test(a2)) start = at(h1, m1, 'a');
  if (start >= end || end - start > 12 * 60) return null;
  return { start, end, text: match[0] };
}

const weekdayOf = (word) => WEEKDAYS.indexOf(word.slice(0, 3).toLowerCase());

/**
 * One schedule line as a rule: weekly, nth or last weekdays, or one date
 * with no year. `{ unread }` when it is not one of those for certain.
 */
export function parseScheduleLine(raw) {
  let text = clean(raw)
    .replace(/\([^)]*\)?/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\|/g, ' ');
  text = clean(text);
  if (/^(currently )?paused[.!]?$/i.test(text)) return { paused: true };
  if (/^(tbd|tba|to be (announced|determined))[.!]?$/i.test(text)) return { none: true };

  let from = null;
  const starting =
    /,?\s*\b(?:starting(?: back up)?|resuming|restarting|starts)\s+(?:on\s+)?([a-z]+\.?\s+\d{1,2}(?:st|nd|rd|th)?)\s*[.!]*$/i.exec(
      text,
    );
  if (starting) {
    from = parseMonthDay(starting[1]);
    if (!from) return { unread: `no date in "${starting[0].trim()}"` };
    text = text.slice(0, starting.index);
  }

  const time = parseTimeRange(text);
  if (!time) return { unread: 'no hours read' };
  const days = clean(
    text
      .replace(time.text, ' ')
      .replace(/\b(from|at|of (the|each|every) month)\b/gi, ' ')
      .replace(/[,.!]+/g, ' '),
  ).toLowerCase();

  let m = new RegExp(`^(?:every )?${WEEKDAY}s$|^every ${WEEKDAY}$`, 'i').exec(days);
  if (m) return { rule: { kind: 'weekly', weekday: weekdayOf(m[1] ?? m[2]), ...time }, from };

  m = new RegExp(`^(${ORDINAL}(?:\\s*(?:,|and|&)\\s*${ORDINAL})*)\\s+${WEEKDAY}s?$`, 'i').exec(
    days,
  );
  if (m) {
    const nths = m[1].split(/\s*(?:,|and|&)\s*/).map((word) => ORDINALS[word]);
    return { rule: { kind: 'monthly', weekday: weekdayOf(m[2]), nths, ...time }, from };
  }

  m = /^([a-z]+\.?\s+\d{1,2}(?:st|nd|rd|th)?)$/i.exec(days);
  const date = m ? parseMonthDay(m[1]) : null;
  if (date) return { rule: { kind: 'date', ...date, ...time }, from };

  return { unread: `"${clean(raw)}" is not a schedule this reads` };
}

/** Every line of one meetup's dates, or why it has none. */
export function parseSchedule(lines) {
  if (lines.length === 0) return { unread: 'no dates given' };
  const rules = [];
  let from = null;
  for (const line of lines) {
    const read = parseScheduleLine(line);
    if (read.paused) return { paused: true };
    if (read.none) return { none: true };
    if (read.unread) return { unread: read.unread };
    rules.push(read.rule);
    if (read.from) from = read.from;
  }
  return { rules, from };
}

const labelOf = (text) => {
  const label = clean((text ?? '').replace(/\bmeet-?ups?\b/i, ''));
  return label || null;
};

/** The regions' meetups, as the page lists them. Throws when there are none. */
export function readMeetups(html) {
  const $ = cheerio.load(html);
  const items = $('.accordion-item').toArray();
  const meetups = [];
  for (const item of items) {
    const region = clean($(item).find('.accordion-item__title').first().text());
    const root = $(item).find('.accordion-item__description').first();
    const contacts = [];
    const here = [];
    let meetup = null;
    let inDates = false;
    for (const line of linesOf($, root)) {
      const header = HEADER.exec(line.text);
      if (header && stateCode(header[2])) {
        meetup = {
          region,
          city: clean(header[1]),
          state: header[2],
          label: labelOf(header[3]),
          heading: line.text,
          gym: null,
          gymUrl: null,
          signUpUrl: null,
          email: null,
          lines: [],
          scheduleLines: [],
          unread: [],
        };
        here.push(meetup);
        inDates = false;
        continue;
      }
      const contact = CONTACT.exec(line.text);
      if (contact) {
        contacts.push({ label: contact[1]?.trim() ?? null, email: contact[2], line });
        inDates = false;
        continue;
      }
      if (!meetup) continue;

      const location = LOCATION.exec(line.text);
      if (location) {
        meetup.gym = clean(location[1]) || null;
        const link = line.links.find((l) => l.text === meetup.gym) ?? line.links[0];
        meetup.gymUrl = link ? webLink(link.href) : null;
        meetup.lines.push(line);
        inDates = false;
        continue;
      }
      const dates = DATES.exec(line.text);
      if (dates) {
        if (dates[1]) meetup.scheduleLines.push(dates[1]);
        meetup.lines.push(line);
        const signUp = line.links.find((l) => !/^mailto:/i.test(l.href) && webLink(l.href));
        if (signUp) meetup.signUpUrl ??= webLink(signUp.href);
        inDates = true;
        continue;
      }
      const link = LINK_LINE.exec(line.text);
      if (link) {
        meetup.signUpUrl ??= webLink(line.links[0]?.href ?? link[1]);
        meetup.lines.push(line);
        inDates = false;
        continue;
      }
      if (inDates && line.text.startsWith('(')) {
        meetup.email ??= new RegExp(EMAIL, 'i').exec(line.text)?.[0] ?? null;
        meetup.lines.push(line);
        continue;
      }
      if (inDates) {
        meetup.scheduleLines.push(line.text);
        meetup.lines.push(line);
        continue;
      }
      meetup.unread.push(line.text);
    }

    // An email labelled with a city is that city's; any other is the
    // region's, for the meetups left, when it is the only one.
    for (const m of here) {
      const own = contacts.find((c) => c.label?.toLowerCase() === m.city.toLowerCase());
      if (!m.email && own) {
        m.email = own.email;
        m.contact = own.line;
      }
    }
    const cities = new Set(here.map((m) => m.city.toLowerCase()));
    const regional = contacts.filter((c) => !c.label || !cities.has(c.label.toLowerCase()));
    if (regional.length === 1) {
      for (const m of here) {
        if (m.email) continue;
        m.email = regional[0].email;
        m.contact = regional[0].line;
      }
    }
    meetups.push(...here);
  }
  if (meetups.length === 0) throw new Error('ParaCliffHangers: no meetups on the Indoor page.');
  return meetups;
}

const slug = (text) =>
  clean(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

function realDay(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCMonth() === month - 1 ? isoDay(year, month, day) : null;
}

/**
 * The days from `today` (YYYY-MM-DD) through `days` later that a rule
 * falls on. A date with no year is the one nearest today; once that has
 * passed it is a stale line, not next year's date.
 */
export function ruleDays(rule, today, days = DAYS) {
  const last = addDays(today, days);
  if (rule.kind === 'date') {
    const year = nearestYear(rule, new Date(`${today}T00:00:00Z`));
    const day = realDay(year, rule.month, rule.day);
    return day && day >= today && day <= last ? [day] : [];
  }
  const out = [];
  for (let i = 0; i <= days; i++) {
    const day = addDays(today, i);
    const date = new Date(`${day}T00:00:00Z`);
    if (date.getUTCDay() !== rule.weekday) continue;
    if (rule.kind === 'weekly') {
      out.push(day);
      continue;
    }
    const dom = date.getUTCDate();
    const monthEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    const nth = Math.ceil(dom / 7);
    const isLast = dom + 7 > monthEnd.getUTCDate();
    if (rule.nths.includes(nth) || (isLast && rule.nths.includes(-1))) out.push(day);
  }
  return out;
}

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A line as HTML, with its links, and a space after "Location:". Not the
 * gym's link: two of the page's go to another meetup's sign-up.
 */
function lineHtml(line) {
  let html = escapeHtml(line.text).replace(
    /^((?:upcoming )?dates?|location|sign ?up):(?=\S)/i,
    '$1: ',
  );
  let from = 0;
  for (const link of LOCATION.test(line.text) ? [] : line.links) {
    const label = escapeHtml(link.text);
    const at = html.indexOf(label, from);
    if (at < 0) continue;
    const anchor = `<a href="${escapeHtml(link.href)}">${label}</a>`;
    html = html.slice(0, at) + anchor + html.slice(at + label.length);
    from = at + anchor.length;
  }
  return html;
}

/** The page's own lines for a meetup, its chapter email last. */
function describe(meetup) {
  const lines = [...meetup.lines];
  if (meetup.contact && !lines.includes(meetup.contact)) lines.push(meetup.contact);
  return convertRichText(`<p>${lines.map(lineHtml).join('<br>')}</p>`, PAGE_URL);
}

/**
 * Each meetup's dates as events, and a warning for each meetup that makes
 * none it should. Paused and "TBD" meetups make none, and say so.
 */
export function meetupEvents(meetups, { now = new Date(), days = DAYS } = {}) {
  const events = [];
  const warnings = [];
  const notes = [];
  const keys = new Set();
  for (const meetup of meetups) {
    const name = meetup.heading;
    if (meetup.unread.length > 0) {
      warnings.push(`${name}: unread line "${meetup.unread[0]}"`);
      continue;
    }
    const schedule = parseSchedule(meetup.scheduleLines);
    if (schedule.paused) {
      notes.push(`${name}: paused`);
      continue;
    }
    if (schedule.none) {
      notes.push(`${name}: no dates yet`);
      continue;
    }
    if (schedule.unread) {
      warnings.push(`${name}: ${schedule.unread}`);
      continue;
    }
    const zone = zoneOfPlace(`${meetup.city}, ${meetup.state}`);
    if (!meetup.gym || !zone) {
      warnings.push(`${name}: ${meetup.gym ? 'no time zone for its state' : 'no gym named'}`);
      continue;
    }

    let key = slug(`${meetup.city} ${meetup.state} ${meetup.label ?? ''}`);
    if (keys.has(key)) key = `${key}-${slug(meetup.gym)}`;
    keys.add(key);

    const today = dayIn(zone, now);
    // The restart nearest today: once past, it has restarted.
    const { from } = schedule;
    const startsOn = from ? isoDay(nearestYear(from, now), from.month, from.day) : null;
    const description = describe(meetup);
    const url = meetup.signUpUrl ?? meetup.gymUrl ?? PAGE_URL;
    const title = `ParaCliffHangers climbing meetup in ${meetup.city}${
      meetup.label ? ` — ${meetup.label.toLowerCase()}` : ''
    }`;
    const seen = new Set();
    for (const rule of schedule.rules) {
      for (const day of ruleDays(rule, today, days)) {
        if (startsOn && day < startsOn) continue;
        const [year, month, d] = day.split('-').map(Number);
        const at = (minutes) =>
          zonedPartsToUtc(
            {
              year,
              month,
              day: d,
              hour: Math.floor(minutes / 60),
              minute: minutes % 60,
              second: 0,
            },
            zone,
          ).toISOString();
        let id = `pch:${key}:${day}`;
        if (seen.has(id)) id += `-${pad(Math.floor(rule.start / 60))}${pad(rule.start % 60)}`;
        seen.add(id);
        events.push({
          external_id: id,
          title,
          description: description.text,
          description_html: description.html,
          location: meetupPlace(meetup.gym, meetup.city, meetup.state),
          stated_city: meetup.city,
          start_time: at(rule.start),
          end_time: at(rule.end),
          all_day: false,
          timezone: zone,
          url,
          registration_url: meetup.signUpUrl,
          host_name: 'ParaCliffHangers',
        });
      }
    }
  }
  return {
    events: events.sort((a, b) => a.start_time.localeCompare(b.start_time)),
    warnings,
    notes,
  };
}

export class ParaCliffHangersMeetupsScraper {
  /** Every date the page gives: ingest.js removes later ones it stops giving. */
  complete = true;

  constructor(feed = {}) {
    this.url = feed.feed_url || PAGE_URL;
    this.days = Number(feed.options?.days) || DAYS;
  }

  async scrape() {
    const meetups = readMeetups(await fetchText(this.url));
    const { events, warnings, notes } = meetupEvents(meetups, { days: this.days });
    for (const note of notes) console.log(`  ParaCliffHangers: ${note}`);
    for (const warning of warnings) console.log(`  ! ParaCliffHangers: ${warning}, no dates made`);
    // A redesign reads as nothing at all: fail the run rather than empty the calendar.
    if (events.length === 0 && warnings.length > 0)
      throw new Error('ParaCliffHangers: meetups listed but none could be read.');
    return events;
  }
}

// CLI: print what the page reads as.
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const event of await new ParaCliffHangersMeetupsScraper().scrape()) {
    console.log(`${event.start_time}  ${event.timezone}  ${event.title}  @ ${event.location}`);
  }
}
