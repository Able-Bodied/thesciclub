/**
 * NorCal SCI Events — JSON prototype (no browser)
 *
 * Feasibility spike for replacing the Puppeteer scraper in
 * `norcalsci-events.js`, which loads the /events listing and then opens ~50
 * individual event pages in a browser tab.
 *
 * Squarespace serves the same collection as JSON:
 *
 *   https://norcalsci.org/events?format=json
 *
 * One request returns `upcoming[]` (every future event, unpaginated) and
 * `past[]` (the first page of past events). Each item carries the full event
 * body as HTML — including anchors — plus structured start/end timestamps and
 * a structured address, so no per-event fetch is needed.
 *
 * Reuses `rich-text.js` unchanged, so descriptions land in exactly the same
 * `{ html, text }` shape the Puppeteer path produces.
 */

import * as cheerio from 'cheerio';
import { convertRichText } from './rich-text.js';
import { reinterpretInstant, zonedParts } from './timezone.js';

const DEFAULT_EVENTS_URL = 'https://norcalsci.org/events';

// NorCal SCI's Squarespace account timezone is misconfigured to Eastern —
// confirmed by cross-checking descriptions that state a time in words
// ("Workout... every Wednesday and Friday at 4pm PST") against what the raw
// startDate epoch actually decodes to in New York. The org is Bay
// Area-based, its events are Pacific, and every timestamp this feed emits
// needs the correction in toIso() below.
const SQUARESPACE_ACCOUNT_TIMEZONE = 'America/New_York';
const EVENT_ACTUAL_TIMEZONE = 'America/Los_Angeles';

// If a description states a clock time and the Pacific time toIso() derives
// disagrees by more than this, either that event's copy is unusually wrong,
// or — the thing this canary actually watches for — NorCal SCI fixed their
// Squarespace account timezone and the correction above is now making things
// worse, not better. Loose enough to tolerate "meet at 4, doors open around
// 4:30"-style copy; tight enough to catch a full 3-hour (NY vs. PT) drift.
const TIMEZONE_CHECK_TOLERANCE_MINUTES = 90;

// First "<hour>[:<minute>] am/pm" in the text, e.g. the "4pm" in "at 4pm PST"
// or the "4:00" in "Time: 4:00-5:30" (am/pm required — a bare "4:00" is too
// ambiguous to check against).
const STATED_TIME_PATTERN = /\b(1[0-2]|0?[1-9])(?::([0-5][0-9]))?\s*([ap]m)\b/i;

function statedTimeMinutesFromMidnight(text) {
  const match = STATED_TIME_PATTERN.exec(text || '');
  if (!match) return null;
  const hour12 = Number(match[1]) % 12;
  const minute = match[2] ? Number(match[2]) : 0;
  const hour = /pm/i.test(match[3]) ? hour12 + 12 : hour12;
  return hour * 60 + minute;
}

/**
 * Best-effort canary for the timezone bug above (see SQUARESPACE_ACCOUNT_TIMEZONE).
 * Logs, never throws — a bad match here should never fail the ingest, only
 * flag it for a human. This is a heuristic, not proof: NorCal SCI's JSON
 * feed does not expose an explicit timezone field to check structurally
 * (see norcalsci-events.md), so a stated time in the copy is the best signal
 * available.
 */
function checkTimezoneCorrectionAgainstCopy(event) {
  if (!event.start_time) return;
  const statedMinutes = statedTimeMinutesFromMidnight(event.description);
  if (statedMinutes === null) return;

  const parts = zonedParts(new Date(event.start_time), EVENT_ACTUAL_TIMEZONE);
  const derivedMinutes = parts.hour * 60 + parts.minute;
  const diff = Math.min(
    Math.abs(derivedMinutes - statedMinutes),
    1440 - Math.abs(derivedMinutes - statedMinutes),
  );

  if (diff > TIMEZONE_CHECK_TOLERANCE_MINUTES) {
    const pad = (n) => String(n).padStart(2, '0');
    console.error(
      `[norcalsci timezone check] "${event.title}" (${event.url}): description states ` +
        `~${pad(Math.floor(statedMinutes / 60))}:${pad(statedMinutes % 60)}, but the NY→Pacific-corrected ` +
        `start time is ${pad(parts.hour)}:${pad(parts.minute)} Pacific (off by ${diff} min). If ` +
        `norcalsci.org fixed its Squarespace account timezone, this correction is now wrong and ` +
        `SQUARESPACE_ACCOUNT_TIMEZONE in norcalsci-events-json.js should be removed.`,
    );
  }
}

/**
 * Squarespace returns plain-text JSON fields (title, address parts)
 * HTML-escaped — `Adaptive Cycling &amp; Lunch`, `Gino&#39;s Pizza`. The
 * rendered page shows them decoded, so decode to match.
 */
function decodeEntities(value) {
  if (!value) return '';
  return cheerio.load(`<x>${value}</x>`, null, false)('x').text();
}

export class NorCalSCIEventsJsonScraper {
  constructor(eventsUrl = DEFAULT_EVENTS_URL, options = {}) {
    this.eventsUrl = eventsUrl;
    this.origin = new URL(eventsUrl).origin;
    this.timeout = options.timeout || 30000;
    // `past` is paginated 30 at a time; `upcoming` always arrives complete on
    // the first page, so the default of 0 extra pages still yields every
    // future event.
    this.pastPages = options.pastPages ?? 0;
    this.includePast = options.includePast ?? false;
  }

  toAbsoluteUrl(href) {
    if (!href) return null;
    try {
      return new URL(href, this.origin).href;
    } catch {
      return null;
    }
  }

  /** Fetch one page of the collection as JSON. */
  async fetchPage(offset) {
    const url = new URL(this.eventsUrl);
    url.searchParams.set('format', 'json');
    if (offset) url.searchParams.set('offset', String(offset));

    const res = await fetch(url, {
      headers: {
        // Squarespace serves the JSON to a plain client, but a real UA avoids
        // the bot heuristics that occasionally gate the HTML routes.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('json')) {
      // Squarespace falls back to rendering HTML when the collection does not
      // support ?format=json — treat that as a hard failure rather than
      // silently parsing a page of markup.
      throw new Error(`${url} returned ${contentType}, expected JSON`);
    }

    return res.json();
  }

  /**
   * The JSON `body` is the whole post layout: nested Squarespace grid//block
   * wrappers around one or more `.sqs-html-content` regions. Narrow to those
   * regions so we feed rich-text.js the same fragment the Puppeteer path
   * scraped from `.eventitem-column-content .sqs-html-content`.
   */
  extractBodyHtml(body) {
    if (!body?.trim()) return '';
    const $ = cheerio.load(body, null, false);

    let blocks = $('.sqs-html-content').toArray();
    // Nested matches would duplicate content; keep outermost only.
    blocks = blocks.filter(
      (el) => !blocks.some((other) => other !== el && $(other).find(el).length),
    );

    if (!blocks.length) return body;
    return blocks.map((el) => $.html($(el).contents())).join('');
  }

  /**
   * Squarespace stores address parts HTML-escaped (e.g. `Gino&#39;s Pizza`)
   * and renders them as a single line. Rebuild that line.
   */
  formatLocation(location) {
    if (!location) return '';
    const parts = [
      location.addressTitle,
      location.addressLine1,
      location.addressLine2,
      location.addressCountry,
    ]
      .map((p) => decodeEntities(p).trim())
      .filter(Boolean);
    return parts.join(' ').replace(/\s+/g, ' ').trim().substring(0, 200);
  }

  /**
   * Squarespace emits epoch milliseconds computed from the account's
   * configured timezone — which for norcalsci.org is wrongly set to Eastern
   * (see SQUARESPACE_ACCOUNT_TIMEZONE above), so what looks like an already-
   * correct UTC instant actually encodes the wrong wall-clock time. Recover
   * the wall clock as NY would have read it, then reapply it as Pacific,
   * which is what NorCal SCI's own admins meant when they typed it in.
   *
   * The values carry a few hundred milliseconds of noise from whenever the
   * event was authored (…:00.820Z), so floor to the second first.
   */
  toIso(millis) {
    if (typeof millis !== 'number' || !Number.isFinite(millis)) return null;
    const raw = new Date(Math.floor(millis / 1000) * 1000);
    if (Number.isNaN(raw.getTime())) return null;
    const corrected = reinterpretInstant(raw, SQUARESPACE_ACCOUNT_TIMEZONE, EVENT_ACTUAL_TIMEZONE);
    return Number.isNaN(corrected.getTime()) ? null : corrected.toISOString();
  }

  normalizeEvent(item, feedId) {
    const url = this.toAbsoluteUrl(item.fullUrl) || this.eventsUrl;
    const description = convertRichText(this.extractBodyHtml(item.body), url);

    const event = {
      feed_id: feedId,
      external_id: url,
      title: decodeEntities(item.title).trim() || 'Untitled Event',
      description: description.text,
      description_html: description.html,
      location: this.formatLocation(item.location),
      start_time: this.toIso(item.startDate ?? item.structuredContent?.startDate),
      end_time: this.toIso(item.endDate ?? item.structuredContent?.endDate),
      url,
      registration_url: null,
      category: 'events',
      updated_at: new Date().toISOString(),
    };

    checkTimezoneCorrectionAgainstCopy(event);
    return event;
  }

  async scrape(feedId) {
    const first = await this.fetchPage();
    const items = [...(first.upcoming || [])];

    if (this.includePast) {
      items.push(...(first.past || []));
      let pagination = first.pagination;
      for (let i = 0; i < this.pastPages && pagination?.nextPage; i++) {
        const page = await this.fetchPage(pagination.nextPageOffset);
        items.push(...(page.past || []));
        pagination = page.pagination;
      }
    }

    // A recurring series repeats the same fullUrl across occurrences only when
    // Squarespace collapses them; dedupe defensively on the absolute URL.
    const seen = new Set();
    const normalized = [];
    for (const item of items) {
      const event = this.normalizeEvent(item, feedId);
      if (!event.title || seen.has(event.external_id)) continue;
      seen.add(event.external_id);
      normalized.push(event);
    }

    normalized.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    return normalized;
  }
}

export default NorCalSCIEventsJsonScraper;

// CLI: print normalized events.
if (import.meta.url === `file://${process.argv[1]}`) {
  const started = Date.now();
  const scraper = new NorCalSCIEventsJsonScraper();
  const events = await scraper.scrape('86f0e291-303c-4e70-8127-5bfd1e2f33ad');
  const elapsed = Date.now() - started;

  const limit = Number(process.argv[2]) || 5;
  for (const e of events.slice(0, limit)) {
    console.log('─'.repeat(70));
    console.log('title      :', e.title);
    console.log('start_time :', e.start_time);
    console.log('end_time   :', e.end_time);
    console.log('url        :', e.url);
    console.log('location   :', e.location || '(none)');
    console.log('desc(text) :', (e.description || '').slice(0, 160).replace(/\n/g, ' ⏎ '));
    console.log('desc(html) :', (e.description_html || '').slice(0, 160));
  }
  console.log('─'.repeat(70));
  console.log(`${events.length} events in ${elapsed} ms`);
  console.log(`with links   : ${events.filter((e) => /<a /.test(e.description_html)).length}`);
  console.log(`with location: ${events.filter((e) => e.location).length}`);
  console.log(`with end_time: ${events.filter((e) => e.end_time).length}`);
}
