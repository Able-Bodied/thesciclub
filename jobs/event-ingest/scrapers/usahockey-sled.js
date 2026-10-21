/**
 * USA Hockey's disabled-hockey events table (feed_url), its sled hockey rows
 * only: the table also lists warrior, blind and special hockey. Option
 * `include` changes which (default "sled").
 *
 * Dates have no hours, so each is all day in its state's zone. A date marked
 * "*" is tentative on their page; it is kept, with the page as the link.
 */

import * as cheerio from 'cheerio';
import { allDayInstants, parseDayRange } from './day-ranges.js';
import { fetchText, joinPlace, patternOption } from './http.js';
import { zoneOfPlace } from './us-zones.js';

export function parseTable(html, pageUrl, options = {}) {
  const $ = cheerio.load(html);
  const include = patternOption(options, 'include') ?? /sled/i;
  const header = $('table tr')
    .first()
    .find('th, td')
    .map((_, c) => $(c).text().trim().toLowerCase())
    .get();
  if (!header.includes('event') || !header.includes('date')) {
    throw new Error('USA Hockey: the events table has changed.');
  }
  const col = (name) => header.indexOf(name);
  const events = [];
  $('table tr')
    .slice(1)
    .each((_, row) => {
      const cells = $(row)
        .find('td')
        .map((_, c) => $(c).text().replace(/\s+/g, ' ').trim())
        .get();
      const title = cells[col('event')];
      if (!title || !include.test(title)) return;
      const days = parseDayRange(cells[col('date')]);
      if (!days) {
        console.log(`  ! USA Hockey: could not read the date of ${title}`);
        return;
      }
      const city = cells[col('location')] ?? '';
      const zone = zoneOfPlace(city) ?? 'America/Los_Angeles';
      const tentative = /\*/.test(cells[col('date')] ?? '');
      events.push({
        external_id: `usahockey:${days.first}:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        title,
        description: tentative ? 'Dates are tentative; check USA Hockey’s page before you go.' : '',
        description_html: tentative
          ? '<p>Dates are tentative; check USA Hockey’s page before you go.</p>'
          : '',
        location: joinPlace(cells[col('rink')], city),
        ...allDayInstants(days, zone),
        all_day: true,
        timezone: zone,
        url: pageUrl,
        registration_url: null,
        host_name: null,
      });
    });
  return events;
}

export class UsaHockeySledScraper {
  constructor(feed) {
    this.url = feed.feed_url;
    this.options = feed.options ?? {};
  }

  async scrape() {
    return parseTable(await fetchText(this.url), this.url, this.options);
  }
}
