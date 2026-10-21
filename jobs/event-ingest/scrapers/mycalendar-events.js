/**
 * Any WordPress site running My Calendar, through its REST API
 * (/wp-json/my-calendar/v1/events?from=…&to=…). feed_url is the site's root.
 * The answer is occurrences grouped by day, repeats already expanded.
 *
 * Options: `category` (keep only that category's events, e.g. BAADS'
 * "Sailing", not its board meetings), `include`/`exclude` title patterns,
 * `days` ahead (default 90), `host_name`.
 */

import * as cheerio from 'cheerio';
import { addDays, dayIn, fetchJson, joinPlace, patternOption } from './http.js';
import { convertRichText } from './rich-text.js';

const ONLINE = /online|zoom|virtual|webinar/i;
const decode = (text) =>
  cheerio
    .load(`<p>${text ?? ''}</p>`)('p')
    .text()
    .replace(/\s+/g, ' ')
    .trim();

/** The location object comes as a JSON string or an object; either way, its parts. */
function placeOf(item) {
  let loc = item.location;
  if (typeof loc === 'string') {
    try {
      loc = JSON.parse(loc);
    } catch {
      loc = null;
    }
  }
  const from = loc && typeof loc === 'object' ? loc : {};
  return joinPlace(
    decode(from.location_label ?? item.event_label),
    decode(from.location_street ?? item.event_street),
    decode(from.location_city ?? item.event_city),
    [from.location_state ?? item.event_state, from.location_postcode ?? item.event_postcode]
      .filter(Boolean)
      .join(' '),
  );
}

export function toEvent(item, options = {}) {
  const title = decode(item.event_title);
  const include = patternOption(options, 'include');
  const exclude = patternOption(options, 'exclude');
  if (!title || (include && !include.test(title)) || exclude?.test(title)) return null;
  if (options.category && item.category_name !== options.category) return null;
  const begin = Number(item.ts_occur_begin);
  if (!Number.isFinite(begin) || begin <= 0) return null;
  const end = Number(item.ts_occur_end);
  const place = placeOf(item);
  const online = ONLINE.test(title) || ONLINE.test(place);
  const description = convertRichText(
    item.event_desc ?? '',
    options.base ?? 'https://www.thesciclub.com/',
  );
  return {
    external_id: `mycal:${item.occur_id}`,
    title,
    description: description.text,
    description_html: description.html,
    location: online ? '' : place,
    start_time: new Date(begin * 1000).toISOString(),
    end_time: Number.isFinite(end) && end > begin ? new Date(end * 1000).toISOString() : null,
    all_day: false,
    timezone: null,
    url: item.event_link || null,
    registration_url: item.event_tickets || item.event_registration || null,
    host_name: options.host_name ?? null,
  };
}

export class MyCalendarEventsScraper {
  constructor(feed) {
    this.root = feed.feed_url.replace(/\/+$/, '');
    this.options = feed.options ?? {};
  }

  async scrape() {
    const from = dayIn('America/Los_Angeles');
    const to = addDays(from, Number(this.options.days) || 90);
    const body = await fetchJson(
      `${this.root}/wp-json/my-calendar/v1/events?from=${from}&to=${to}`,
    );
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error(`${this.root}: My Calendar answered something else.`);
    }
    const options = { ...this.options, base: this.root };
    return Object.values(body)
      .flatMap((day) => (Array.isArray(day) ? day : []))
      .map((item) => toEvent(item, options))
      .filter(Boolean);
  }
}
