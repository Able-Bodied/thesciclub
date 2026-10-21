/**
 * Triumph Foundation's event calendar (feed_url), a page of its own making:
 * each event has a date line ("November 7, 2026 @ 8:30 am - 2:00 pm"), a
 * title, a venue and a summary. Its own events are tagged "Triumph Featured
 * Event" and are Triumph's; the rest are partners' ("Community Event"), so
 * they carry no host rather than Triumph's name (the feed has no organization).
 *
 * Southern California, so Pacific; an event on Zoom is online.
 */

import * as cheerio from 'cheerio';
import { fetchText } from './http.js';
import { zonedPartsToUtc } from './timezone.js';

const ZONE = 'America/Los_Angeles';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const TIME = '(\\d{1,2})(?::(\\d{2}))?\\s*([ap])\\.?m\\.?';
const DAY = '([A-Za-z]+)\\.? (\\d{1,2})(?:, (\\d{4}))?';
const LINE = new RegExp(`${DAY} @ ${TIME}(?: - (?:${DAY} @ )?${TIME})?`, 'i');

function at(year, monthWord, day, hour, minute, meridiem) {
  const month = MONTHS.indexOf(monthWord.slice(0, 3).toLowerCase()) + 1;
  if (!month) return null;
  const h = (Number(hour) % 12) + (meridiem.toLowerCase() === 'p' ? 12 : 0);
  return zonedPartsToUtc(
    {
      year: Number(year),
      month,
      day: Number(day),
      hour: h,
      minute: Number(minute ?? 0),
      second: 0,
    },
    ZONE,
  ).toISOString();
}

/** "October 24, 2026 @ 4:00 pm" or "… @ 9:30 am - 12:30 pm" or "… @ 5 pm - Dec 4 @ 2 pm". */
export function parseWhen(text) {
  const m = LINE.exec(text ?? '');
  if (!m) return null;
  const [, mon, day, year, h1, m1, p1, mon2, day2, year2, h2, m2, p2] = m;
  if (!year) return null;
  const start = at(year, mon, day, h1, m1, p1);
  const end = h2 ? at(year2 ?? year, mon2 ?? mon, day2 ?? day, h2, m2, p2) : null;
  return start ? { start, end } : null;
}

export function parseEvents(html) {
  const $ = cheerio.load(html);
  const items = $('.event-item-wrapper');
  if ($('.event-list-wrapper').length === 0)
    throw new Error('Triumph: the event list has changed.');
  const events = [];
  items.each((_, el) => {
    const item = $(el);
    const details = item.find('.date-details');
    const featured = /triumph featured/i.test(details.find('.tf-event-tag').text());
    const when = parseWhen(details.text().replace(/\s+/g, ' '));
    const link = item.find('.event-title a');
    const title = link.text().replace(/\s+/g, ' ').trim();
    if (!when || !title) {
      console.log(`  ! Triumph: could not read ${title || 'an event'}`);
      return;
    }
    item.find('.venue br').replaceWith(', ');
    const venue = item
      .find('.venue')
      .text()
      .replace(/\s+/g, ' ')
      .replace(/ ,/g, ',')
      .replace(/[,\s]+$/, '')
      .trim();
    const online = /^zoom$|online|virtual/i.test(venue);
    const summary = item.find('.summary').text().replace(/\s+/g, ' ').trim();
    const url = link.attr('href') ?? null;
    events.push({
      external_id: `triumph:${url ?? title}`,
      title,
      description: summary,
      description_html: summary ? `<p>${summary.replace(/[<>&]/g, '')}</p>` : '',
      location: online ? '' : venue,
      start_time: when.start,
      end_time: when.end,
      all_day: false,
      timezone: null,
      url,
      registration_url: null,
      host_name: featured ? 'Triumph Foundation' : null,
    });
  });
  if (items.length > 0 && events.length === 0) throw new Error('Triumph: no event could be read.');
  return events;
}

export class TriumphEventsScraper {
  constructor(feed) {
    this.url = feed.feed_url;
  }

  async scrape() {
    return parseEvents(await fetchText(this.url));
  }
}
