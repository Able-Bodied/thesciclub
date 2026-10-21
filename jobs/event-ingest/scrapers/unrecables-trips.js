/**
 * The Unrecables' ski trips (feed_url, its /trips/ page): a TablePress table
 * of date ranges ("11/20/2026 - 11/22/2026") and the last day to register.
 * Every trip is to Mammoth Mountain, so each is an all-day weekend there.
 */

import * as cheerio from 'cheerio';
import { allDayInstants } from './day-ranges.js';
import { fetchText } from './http.js';

const ZONE = 'America/Los_Angeles';
const PLACE = 'Mammoth Mountain, Mammoth Lakes, CA';

/** "1/22/2027" → "2027-01-22". */
function isoDay(text) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((text ?? '').trim());
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
}

export function parseTrips(html, pageUrl) {
  const $ = cheerio.load(html);
  const table = $('table[id^="tablepress"]').first();
  if (table.length === 0) throw new Error('Unrecables: the trips table is gone.');
  const events = [];
  table.find('tbody tr').each((_, row) => {
    const cells = $(row)
      .find('td')
      .map((__, c) => $(c).text().trim())
      .get();
    const [first, last] = (cells[0] ?? '').split('-').map(isoDay);
    if (!first || !last) return;
    const deadline = isoDay(cells[1]);
    const by = deadline
      ? ` Register by ${new Date(`${deadline}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })}.`
      : '';
    const description = `A weekend of adaptive skiing and snowboarding at Mammoth Mountain with The Unrecables, a Los Angeles adaptive ski club.${by}`;
    events.push({
      external_id: `unrecables:${first}`,
      title: 'Unrecables trip to Mammoth',
      description,
      description_html: `<p>${description}</p>`,
      location: PLACE,
      ...allDayInstants({ first, last }, ZONE),
      all_day: true,
      timezone: ZONE,
      url: pageUrl,
      registration_url: null,
      host_name: null,
    });
  });
  return events;
}

export class UnrecablesTripsScraper {
  constructor(feed) {
    this.url = feed.feed_url;
  }

  async scrape() {
    return parseTrips(await fetchText(this.url), this.url);
  }
}
