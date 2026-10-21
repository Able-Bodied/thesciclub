/**
 * A city's ActiveNet activity search (feed_url, the `rest/activities/list`
 * address), for one category: Sacramento's Access Leisure, 2026-10-20.
 *
 * Options: `category` (the category id, required), `exclude` titles, and
 * `title_prefix`, a pattern to strip ("^ACL\\s*-\\s*", typed three ways). Programs with an upper age limit (teen
 * and youth groups) are left out. The day is the item's own; the hours and
 * the place are only in its description ("Activity Date: … 6:00-8:30pm",
 * "Location: …", "Address: …"), so an item without hours is all day.
 */

import { allDayInstants } from './day-ranges.js';
import { fetchJson, joinPlace, patternOption } from './http.js';
import { convertRichText } from './rich-text.js';
import { zonedPartsToUtc } from './timezone.js';

const ZONE = 'America/Los_Angeles';
const MAX_PAGES = 10;
const HOURS =
  /(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?/i;

/** "6:00-8:30pm" or "9:15am-10:30am" → minutes from midnight; a start without am/pm takes the end's. */
export function parseHours(text) {
  const m = HOURS.exec(text ?? '');
  if (!m) return null;
  const [, h1, m1, p1, h2, m2, p2] = m;
  const endPm = p2.toLowerCase() === 'p';
  const end = (Number(h2) % 12) * 60 + (endPm ? 720 : 0) + Number(m2 ?? 0);
  let start = (Number(h1) % 12) * 60 + Number(m1 ?? 0);
  if (p1 ? p1.toLowerCase() === 'p' : endPm) start += 720;
  if (!p1 && start > end) start -= 720;
  return start < end ? { start, end } : null;
}

const plain = (html) => convertRichText(html ?? '', 'https://apm.activecommunities.com/').text;

function line(text, label) {
  const m = new RegExp(`^${label}:\\s*(.+)$`, 'im').exec(text);
  return m ? m[1].trim() : '';
}

export function toEvent(item, options = {}) {
  const exclude = patternOption(options, 'exclude');
  if ((item.age_max_year ?? 0) > 0) return null;
  const prefix = patternOption(options, 'title_prefix');
  const title = item.name
    .replace(prefix ?? /^$/, '')
    .replace(
      /\s+-\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b.*$/i,
      '',
    )
    .trim();
  if (!title || exclude?.test(title)) return null;
  const day = item.date_range_start;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) return null;

  const text = plain(item.desc);
  const hours = parseHours(text);
  const [year, month, d] = day.split('-').map(Number);
  const at = (minutes) =>
    zonedPartsToUtc(
      { year, month, day: d, hour: Math.floor(minutes / 60), minute: minutes % 60, second: 0 },
      ZONE,
    ).toISOString();
  const place =
    joinPlace(line(text, 'Location'), line(text, 'Address')) || item.location?.label || '';
  const description = convertRichText(
    item.desc ?? '',
    item.detail_url ?? 'https://apm.activecommunities.com/',
  );

  return {
    external_id: `activenet:${item.id}`,
    title,
    description: description.text,
    description_html: description.html,
    location: /\bCA\b|California/.test(place) || !place ? place : `${place}, Sacramento, CA`,
    ...(hours
      ? { start_time: at(hours.start), end_time: at(hours.end), all_day: false }
      : { ...allDayInstants({ first: day, last: day }, ZONE), all_day: true }),
    timezone: null,
    url: item.detail_url ?? null,
    registration_url: item.enroll_now?.href ?? item.action_link?.href ?? null,
    host_name: options.host_name ?? null,
  };
}

export class ActiveNetEventsScraper {
  constructor(feed) {
    this.url = feed.feed_url;
    this.options = feed.options ?? {};
  }

  async scrape() {
    if (!this.options.category) throw new Error(`${this.url}: no category in the feed's options.`);
    const events = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const body = await fetchJson(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          page_info: JSON.stringify({
            order_by: '',
            page_number: page,
            total_records_per_page: 20,
          }),
        },
        body: JSON.stringify({
          activity_search_pattern: {
            activity_select_param: 2,
            activity_category_ids: [String(this.options.category)],
          },
          activity_transfer_pattern: {},
        }),
      });
      const items = body?.body?.activity_items;
      if (!Array.isArray(items)) throw new Error(`${this.url}: no activity_items in the answer.`);
      for (const item of items) {
        const event = toEvent(item, this.options);
        if (event) events.push(event);
      }
      if (page >= (body.headers?.page_info?.total_page ?? 1)) break;
    }
    return events;
  }
}
