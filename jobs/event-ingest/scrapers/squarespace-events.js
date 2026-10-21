/**
 * Any Squarespace events page (feed_url), through its JSON (?format=json),
 * whose `upcoming` array carries each event's times, place and body.
 *
 * Options: `include`/`exclude` title patterns, `host_name`, and
 * `account_timezone`, for a site whose Squarespace clock is set to the wrong
 * zone (NorCal SCI's says New York for the Bay Area; see
 * norcalsci-events-json.js): its times are re-read as Pacific.
 */

import * as cheerio from 'cheerio';
import { fetchJson, joinPlace, patternOption } from './http.js';
import { convertRichText } from './rich-text.js';
import { reinterpretInstant } from './timezone.js';
import { ianaZone } from './tribe-events.js';

const decode = (text) =>
  cheerio
    .load(`<p>${text ?? ''}</p>`)('p')
    .text()
    .trim();

function bodyHtml(body) {
  if (!body?.trim()) return '';
  const $ = cheerio.load(body, null, false);
  const blocks = $('.sqs-html-content').toArray();
  return blocks.length ? blocks.map((el) => $.html($(el).contents())).join('') : body;
}

export function toEvent(item, pageUrl, options = {}) {
  const title = decode(item.title);
  const include = patternOption(options, 'include');
  const exclude = patternOption(options, 'exclude');
  if (!title || (include && !include.test(title)) || exclude?.test(title)) return null;
  const wrongZone = ianaZone(options.account_timezone);
  const instant = (ms) => {
    if (typeof ms !== 'number') return null;
    const raw = new Date(Math.floor(ms / 1000) * 1000);
    return (
      wrongZone ? reinterpretInstant(raw, wrongZone, 'America/Los_Angeles') : raw
    ).toISOString();
  };
  const url = item.fullUrl ? new URL(item.fullUrl, pageUrl).toString() : pageUrl;
  const description = convertRichText(bodyHtml(item.body), url);
  const place = item.location ?? {};
  return {
    external_id: `sqs:${item.id ?? url}`,
    title,
    description: description.text,
    description_html: description.html,
    location: joinPlace(
      decode(place.addressTitle),
      decode(place.addressLine1),
      decode(place.addressLine2),
    ),
    start_time: instant(item.startDate),
    end_time: instant(item.endDate),
    all_day: false,
    timezone: null,
    url,
    registration_url: null,
    host_name: options.host_name ?? null,
  };
}

export class SquarespaceEventsScraper {
  constructor(feed) {
    this.url = feed.feed_url;
    this.options = feed.options ?? {};
  }

  async scrape() {
    const json = new URL(this.url);
    json.searchParams.set('format', 'json');
    const body = await fetchJson(json.toString());
    if (!Array.isArray(body.upcoming))
      throw new Error(`${this.url}: no upcoming events in its JSON.`);
    return body.upcoming.map((item) => toEvent(item, this.url, this.options)).filter(Boolean);
  }
}
