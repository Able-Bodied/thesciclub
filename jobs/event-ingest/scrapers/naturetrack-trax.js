/**
 * NatureTrack Freedom Trax days, from the "Monthly Freedom Trax Schedule" on
 * https://naturetrack.org/naturetrack-freedom-trax/.
 *
 * The schedule is an Elementor block: one <ul> per outing, three items each —
 * place, date ("October 24th", no year) and hours ("11-3", no am/pm). Only
 * this block is read, so NatureTrack's other programs never reach the club.
 * The place's map links are ignored: on 2026-10-20 two of three pointed at
 * the wrong beach.
 */

import * as cheerio from 'cheerio';
import { zonedPartsToUtc } from './timezone.js';

const PAGE_URL = 'https://naturetrack.org/naturetrack-freedom-trax/';
// Where NatureTrack's emails send people to RSVP; "REGISTER (monthly)" is a stale form.
const BORROW_URL = 'https://naturetrack.org/borrow-a-freedom-trax/';
const HEADING = /freedom trax schedule/i;
const TIMEZONE = 'America/Los_Angeles';
const DAY_MS = 86_400_000;

// SiteGround answers a browser-looking agent missing a browser's other headers with 403.
const USER_AGENT = 'thesciclub-event-ingest/1.0 (+https://www.thesciclub.com)';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "October 24th", "Oct. 3" → { month, day }, or null. */
export function parseMonthDay(text) {
  const match = /\b([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(text ?? '');
  if (!match) return null;
  const month = MONTHS.indexOf(match[1].toLowerCase()) + 1;
  const day = Number(match[2]);
  if (month === 0 || day < 1 || day > 31) return null;
  return { month, day };
}

/** The year that puts month/day closest to `now`, so October read in December stays this year. */
export function nearestYear({ month, day }, now) {
  const year = now.getUTCFullYear();
  let best = year;
  for (const candidate of [year - 1, year, year + 1]) {
    const distance = Math.abs(Date.UTC(candidate, month - 1, day) - now.getTime());
    if (distance < Math.abs(Date.UTC(best, month - 1, day) - now.getTime())) best = candidate;
  }
  return best;
}

/** A bare hour on an outdoor day: 7–11 is morning, 12 and 1–6 afternoon. */
function to24(hour, meridiem) {
  if (meridiem) return (hour % 12) + (/p/i.test(meridiem) ? 12 : 0);
  return hour >= 7 && hour <= 11 ? hour : (hour % 12) + 12;
}

/** "11-3", "10:00 - 2:30", "10am–2pm" → minutes from midnight, or null. */
export function parseHours(text) {
  const match =
    /(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/i.exec(
      text ?? '',
    );
  if (!match) return null;
  const start = to24(Number(match[1]), match[3]) * 60 + Number(match[2] ?? 0);
  const end = to24(Number(match[4]), match[6]) * 60 + Number(match[5] ?? 0);
  if (start >= 24 * 60 || end >= 24 * 60 || end <= start) return null;
  return { start, end };
}

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function describe(registrationUrl) {
  const paragraphs = [
    'Borrow a Freedom Trax for free and cruise out onto the sand. A Freedom Trax turns a manual wheelchair into a battery-powered, all-terrain chair you steer with a joystick. NatureTrack can lend a manual wheelchair too.',
    'To RSVP, fill in NatureTrack’s Borrow a Freedom Trax form. Under Purpose of Use, pick this day; under Freedom Trax Pick-Up Location, pick “Borrowing at NatureTrack upcoming event”. NatureTrack emails you to confirm your ride time.',
  ];
  return {
    text: paragraphs.join('\n\n'),
    html:
      `<p>${escapeHtml(paragraphs[0])}</p>` +
      `<p>To RSVP, fill in NatureTrack’s <a href="${escapeHtml(registrationUrl)}">Borrow a Freedom Trax form</a>. ` +
      'Under Purpose of Use, pick this day; under Freedom Trax Pick-Up Location, pick “Borrowing at NatureTrack upcoming event”. ' +
      'NatureTrack emails you to confirm your ride time.</p>',
  };
}

/** Every outing in the schedule block. Throws if the block is gone, so a redesign turns the run red. */
export function parseSchedule(html, now = new Date()) {
  const $ = cheerio.load(html);
  const heading = $('h1, h2, h3, h4')
    .filter((_, el) => HEADING.test($(el).text()))
    .first();
  if (heading.length === 0)
    throw new Error('NatureTrack: the Freedom Trax schedule heading is gone.');

  const borrow = $('a')
    .filter((_, el) => /borrow a freedom trax/i.test($(el).text()))
    .first()
    .attr('href');
  const registrationUrl = borrow?.startsWith('https://') ? borrow : BORROW_URL;
  const description = describe(registrationUrl);

  // The lists sit in the sections after the heading's, up to the next heading.
  const lists = [];
  let section = heading.closest('.elementor-element').parent().closest('.elementor-element');
  if (section.length === 0) section = heading.parent();
  for (let next = section.next(); next.length > 0; next = next.next()) {
    if (next.find('h1, h2, h3, h4').length > 0) break;
    next.find('ul').each((_, ul) => {
      lists.push(
        $(ul)
          .find('li')
          .map((_, li) => $(li).text().replace(/\s+/g, ' ').trim())
          .get()
          .filter(Boolean),
      );
    });
  }

  const events = [];
  const seen = new Set();
  for (const [place, dateText, hoursText] of lists) {
    const monthDay = parseMonthDay(dateText);
    const hours = parseHours(hoursText);
    if (!place || !monthDay) {
      console.error(
        `  ! NatureTrack: could not read an outing: ${[place, dateText, hoursText].join(' | ')}`,
      );
      continue;
    }
    const year = nearestYear(monthDay, now);
    const date = `${year}-${String(monthDay.month).padStart(2, '0')}-${String(monthDay.day).padStart(2, '0')}`;
    const at = (minutes) =>
      zonedPartsToUtc(
        {
          year,
          month: monthDay.month,
          day: monthDay.day,
          hour: Math.floor(minutes / 60),
          minute: minutes % 60,
          second: 0,
        },
        TIMEZONE,
      ).toISOString();

    let externalId = `naturetrack-trax-${date}`;
    if (seen.has(externalId)) externalId += `-${events.length}`;
    seen.add(externalId);

    events.push({
      external_id: externalId,
      title: `Freedom Trax at ${place}`,
      description: description.text,
      description_html: description.html,
      // Bare "Rincon Beach" geocodes to Puerto Rico. No comma: geocode.js would
      // retry "California" alone and pin an unknown place mid-state.
      location: `${place} California`,
      // No hours, no start time: ingest.js drops it loudly rather than guessing.
      start_time: hours ? at(hours.start) : null,
      end_time: hours ? at(hours.end) : null,
      url: PAGE_URL,
      registration_url: registrationUrl,
      host_name: 'NatureTrack',
    });
  }

  if (lists.length > 0 && events.length === 0) {
    throw new Error('NatureTrack: the schedule has outings but none could be read.');
  }
  // Too far back to be this year's outing and not yet next year's.
  return events.filter(
    (event) => !event.start_time || Date.parse(event.start_time) > now.getTime() - 180 * DAY_MS,
  );
}

export class NatureTrackTraxScraper {
  async scrape() {
    const res = await fetch(PAGE_URL, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`NatureTrack: ${PAGE_URL} answered ${res.status}.`);
    return parseSchedule(await res.text());
  }
}

// CLI: print what the schedule reads as.
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const event of await new NatureTrackTraxScraper().scrape()) {
    console.log(
      `${event.start_time} – ${event.end_time}  ${event.title}  → ${event.registration_url}`,
    );
  }
}
