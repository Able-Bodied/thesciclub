/**
 * Any WordPress site running The Events Calendar, through its REST API
 * (/wp-json/tribe/events/v1/events). feed_url is the site's root.
 *
 * Options (data_feeds.options): `include` and `exclude`, patterns matched
 * against the title, for a site whose calendar also carries galas or trade
 * shows; `host_name`; `days`, how far ahead to read (default 120);
 * `location`, for a site whose events are all at one centre and name no
 * venue; `timezone`, for a site whose clock is set wrong (BlazeSports' says
 * UTC for Atlanta), which re-reads its local times in that zone.
 *
 * An event's own zone is kept when it has a venue, or is all day: an online
 * class at 6pm Eastern is then read in the club's time, 3pm, and a day stays
 * the day it is where it happens.
 */

import * as cheerio from 'cheerio';
import { addDays, dayIn, fetchJson, joinPlace, patternOption } from './http.js';
import { convertRichText } from './rich-text.js';
import { zonedPartsToUtc } from './timezone.js';

const MAX_PAGES = 20;

const utcIso = (value) => (value ? `${value.replace(' ', 'T')}Z` : null);

/** A real IANA zone ("America/Chicago"), not "UTC+0", which the column refuses. */
export function ianaZone(zone) {
  if (typeof zone !== 'string' || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$/.test(zone)) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

/** "2026-10-20 10:00:00" read as a wall clock in `zone`. */
function localIso(value, zone) {
  const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/.exec(value ?? '');
  if (!m) return null;
  const [, year, month, day, hour, minute] = m.map(Number);
  return zonedPartsToUtc({ year, month, day, hour, minute, second: 0 }, zone).toISOString();
}
const decode = (text) =>
  cheerio
    .load(`<p>${text ?? ''}</p>`)('p')
    .text()
    .trim();

/** One API event as the import's shape, or null when the title filters drop it. */
export function toEvent(item, options = {}) {
  const title = decode(item.title);
  const include = patternOption(options, 'include');
  const exclude = patternOption(options, 'exclude');
  if (!title || (include && !include.test(title)) || exclude?.test(title)) return null;

  const venue = item.venue && !Array.isArray(item.venue) ? item.venue : null;
  const place = venue
    ? joinPlace(
        decode(venue.venue),
        decode(venue.address),
        decode(venue.city),
        [venue.stateprovince || venue.state || venue.province, venue.zip].filter(Boolean).join(' '),
      )
    : (options.location ?? '');
  const description = convertRichText(item.description ?? '', item.url);
  const allDay = item.all_day === true;
  const fixed = ianaZone(options.timezone);
  const zone = fixed ?? ianaZone(item.timezone);

  return {
    external_id: `tribe:${item.id}`,
    title,
    description: description.text,
    description_html: description.html,
    location: place,
    start_time: fixed ? localIso(item.start_date, fixed) : utcIso(item.utc_start_date),
    end_time: fixed ? localIso(item.end_date, fixed) : utcIso(item.utc_end_date),
    all_day: allDay,
    timezone: venue || allDay || options.location ? zone : null,
    url: item.url ?? null,
    registration_url: item.website || null,
    host_name: options.host_name ?? null,
  };
}

export class TribeEventsScraper {
  constructor(feed) {
    this.root = feed.feed_url.replace(/\/+$/, '');
    this.options = feed.options ?? {};
  }

  async scrape() {
    const today = dayIn('America/Los_Angeles');
    const days = Number(this.options.days) || 120;
    let next =
      `${this.root}/wp-json/tribe/events/v1/events?per_page=50` +
      `&start_date=${today}&end_date=${addDays(today, days)}`;
    const events = [];
    for (let page = 0; next && page < MAX_PAGES; page++) {
      const body = await fetchJson(next);
      if (!Array.isArray(body.events))
        throw new Error(`${this.root}: no events array in the API answer.`);
      for (const item of body.events) {
        const event = toEvent(item, this.options);
        if (event) events.push(event);
      }
      next = body.next_rest_url ?? null;
    }
    return events;
  }
}
