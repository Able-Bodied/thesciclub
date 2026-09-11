/**
 * AdaptiveRecHub Events — list endpoint + per-event detail pages
 *
 * adaptiverechub.org is a hub: one feed carrying events from many different host orgs. Every card
 * names the org hosting it in a "Program" field, which this scraper emits as
 * `organization_name`/`organization_slug` on each event, plus `organization_url` — the org's own
 * page on the hub. Those are not columns — `ingest.js` resolves them to `events.organization_id`
 * and `organizations.source_url`.
 *
 * Endpoint details, field coverage and parsing gotchas are documented in
 * ./adaptiverechub-events.md. Three things shape this file:
 *
 *  - **The list endpoint is one request, and it is thin.** `limit=500` returns every event the geo
 *    filter matches, unpaginated — but a card carries only title, date, venue, sport and Program.
 *    The description a person actually reads, and the registration link, are on the event's own
 *    page.
 *  - **Detail pages are expensive.** `robots.txt` asks for `Crawl-delay: 10`, so fetching all ~29
 *    local events costs ~5 minutes. The sitemap's `<lastmod>` makes that incremental: we re-fetch
 *    a page only when the source changed it since we last looked (see `needsDetailFetch`). A
 *    steady-state refresh does zero detail fetches.
 *  - **The responses are rendered HTML, not JSON events.** That makes extraction markup-coupled: a
 *    theme update breaks it silently. `scrape()` therefore throws rather than returning an empty
 *    list, so a broken selector shows up as a failed feed instead of "0 events today".
 *
 * TODO(team): no event photos yet. Each event page carries a hero image, but collecting them means
 * downloading ~29 more assets on top of the page fetches — see the "Event images" section of
 * adaptiverechub-events.md. The detail-page pass this file now does is the natural place to hang
 * it once we've agreed on the storage/bandwidth story.
 */

import * as cheerio from 'cheerio';
import { convertRichText } from './rich-text.js';
import { zonedPartsToUtc } from './timezone.js';

const ORIGIN = 'https://adaptiverechub.org';
const ENDPOINT = `${ORIGIN}/wp-json/kbf/v2/events`;
const SITEMAP_INDEX = `${ORIGIN}/wp-sitemap.xml`;

// The site geocodes client-side and passes lat/long to the server, which does the distance filter
// for us. 95101 (downtown San Jose), geocoded via Nominatim: everything this scraper returns is
// therefore Bay Area local, which is what makes the Pacific assumption in parseCardDate() safe.
const ORIGIN_LATITUDE = 37.389338;
const ORIGIN_LONGITUDE = -121.887614;
const RADIUS_MILES = 100;

// Above the ~420-event national corpus, so one request is always the whole result set.
const PAGE_LIMIT = 500;

// robots.txt: `Crawl-delay: 10`. Applied between every request this file makes to the host — the
// list endpoint, each sitemap chunk, and each detail page.
const CRAWL_DELAY_MS = 10_000;

// Cloudflare fronts the site; the REST endpoint doesn't require a session, but it does want to
// look like a browser is asking.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';

/** `MM/DD/YY h:mm AM|PM`, e.g. the "08/18/26 7:00 AM" in a card's `.date span`. */
const CARD_DATE_PATTERN = /(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i;

// Every event is within 100mi of San Jose, so a card's clock time is Pacific wall-clock time.
// Unlike NorCal SCI's feed this is a documented assumption, not a correction for a broken account
// timezone — there is no per-event zone in the markup to disagree with.
const EVENT_TIMEZONE = 'America/Los_Angeles';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wall-clock parts from a card's date string, as the UTC instant Pacific reads them at.
 * Returns null for anything that doesn't match — the caller drops that card rather than
 * inventing a time.
 */
function parseCardDate(dateText) {
  const match = CARD_DATE_PATTERN.exec(dateText ?? '');
  if (!match) return null;

  const [, month, day, year, hour, minute, meridiem] = match;
  const hour12 = Number.parseInt(hour, 10) % 12;

  return zonedPartsToUtc(
    {
      // Two-digit years on a feed of upcoming events are unambiguously 2000s.
      year: 2000 + Number.parseInt(year, 10),
      month: Number.parseInt(month, 10),
      day: Number.parseInt(day, 10),
      hour: meridiem.toUpperCase() === 'PM' ? hour12 + 12 : hour12,
      minute: Number.parseInt(minute, 10),
      second: 0,
    },
    EVENT_TIMEZONE,
  );
}

/** Program name → slug, e.g. "ParaCliffHangers – Movement LIC" → "paracliffhangers-movement-lic". */
function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The event chunks of a WordPress sitemap index, in order.
 *
 * The index also lists pages, forum topics, programs, equipment and users; only
 * `wp-sitemap-posts-events-N.xml` holds event pages, and there are currently five of them at 2000
 * URLs each. Filtering here is what keeps this from being a crawl of the whole site.
 */
export function parseSitemapIndex(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map((match) => match[1])
    .filter((loc) => /wp-sitemap-posts-events-\d+\.xml$/.test(loc));
}

/**
 * `<loc>` → `<lastmod>` for one sitemap chunk.
 *
 * WordPress core emits a lastmod for every entry, which is what makes the incremental fetch
 * possible; an entry without one maps to null and is treated as "always stale" downstream.
 */
export function parseUrlSet(xml) {
  const entries = new Map();
  for (const [, block] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>\s*([^<\s]+)\s*<\/loc>/.exec(block)?.[1];
    if (!loc) continue;
    entries.set(loc, /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/.exec(block)?.[1] ?? null);
  }
  return entries;
}

/**
 * Should we spend a 10-second crawl slot re-reading this event's page?
 *
 * Yes when we have never read it, yes when the sitemap says it changed since we last did, and yes
 * when the sitemap declines to say (no lastmod) — an unknown is not evidence of freshness. No only
 * when the source's own timestamp is at or behind the one we stored, which is the steady state and
 * the whole point of consulting the sitemap.
 */
export function needsDetailFetch(sitemapLastModified, storedLastModified) {
  if (!storedLastModified) return true;
  if (!sitemapLastModified) return true;

  const sitemapTime = Date.parse(sitemapLastModified);
  const storedTime = Date.parse(storedLastModified);
  if (Number.isNaN(sitemapTime) || Number.isNaN(storedTime)) return true;

  return sitemapTime > storedTime;
}

/**
 * The fields only an event's own page carries: the description a person reads, and the outbound
 * registration link.
 *
 * `.video-hero__description` is the body copy; `a.kbf_primary_btn` is the "Learn more" button.
 * That button is deliberately distinguished from the unclassed "Learn More" links further down the
 * page, which belong to the "Our Other Events" cards and point back into adaptiverechub.org — a
 * naive text match on "learn more" picks up a sibling event's URL and files it as this event's
 * registration link.
 */
export function parseDetailHtml(html, pageUrl) {
  const $ = cheerio.load(html);

  // Cloudflare rewrites mailto links into `<a class="__cf_email__" href="/cdn-cgi/l/...">`, whose
  // href resolves to a redirector rather than an address. Keep the visible text, drop the link —
  // storing a decoded address would also pull a contact email into copy that docs/PII.md governs.
  $('.__cf_email__').each((_, el) => {
    $(el).replaceWith($(el).text() || '[email protected]');
  });

  const descriptionHtml = $('.video-hero__description').html() ?? '';
  const { html: cleanHtml, text } = convertRichText(descriptionHtml, pageUrl);

  const registrationHref = $('a.kbf_primary_btn[href]').first().attr('href')?.trim() ?? null;
  let registrationUrl = null;
  if (registrationHref) {
    try {
      const resolved = new URL(registrationHref, pageUrl);
      // A "Learn more" that stays on the hub is navigation, not a registration destination.
      if (resolved.hostname !== new URL(ORIGIN).hostname) registrationUrl = resolved.toString();
    } catch {
      registrationUrl = null;
    }
  }

  return { description: text, description_html: cleanHtml, registration_url: registrationUrl };
}

export class AdaptiveRecHubEventsScraper {
  constructor({ latitude, longitude, radiusMiles, crawlDelayMs } = {}) {
    this.latitude = latitude ?? ORIGIN_LATITUDE;
    this.longitude = longitude ?? ORIGIN_LONGITUDE;
    this.radiusMiles = radiusMiles ?? RADIUS_MILES;
    this.crawlDelayMs = crawlDelayMs ?? CRAWL_DELAY_MS;
    this.lastRequestAt = 0;
  }

  /** Serializes every request to the host behind robots.txt's crawl delay. */
  async politeFetch(url, init) {
    const waited = Date.now() - this.lastRequestAt;
    if (this.lastRequestAt && waited < this.crawlDelayMs) {
      await sleep(this.crawlDelayMs - waited);
    }
    this.lastRequestAt = Date.now();
    return fetch(url, {
      ...init,
      headers: { 'User-Agent': USER_AGENT, ...(init?.headers ?? {}) },
    });
  }

  /**
   * @param {string} feedId
   * @param {object} [options]
   * @param {Map<string, object>} [options.priorByExternalId] Rows already on file for this feed,
   *   keyed by `external_id`, each with `source_last_modified`, `description`, `description_html`
   *   and `registration_url`. Used to decide which detail pages to skip — and, for the skipped
   *   ones, to carry the stored copy forward so the upsert doesn't overwrite a rich description
   *   with the thin one from the list card.
   */
  async scrape(feedId, { priorByExternalId = new Map() } = {}) {
    const events = this.parseListHtml(await this.fetchListHtml(), feedId);

    const lastModifiedByUrl = await this.fetchEventLastModified(
      new Set(events.map((event) => event.url)),
    );

    let fetched = 0;
    let skipped = 0;
    let failed = 0;

    for (const event of events) {
      const sitemapLastModified = lastModifiedByUrl.get(event.url) ?? null;
      const prior = priorByExternalId.get(event.external_id) ?? null;
      event.source_last_modified = sitemapLastModified;

      if (prior && !needsDetailFetch(sitemapLastModified, prior.source_last_modified)) {
        // Unchanged at the source: carry forward what we already stored, so the diff in
        // ingest.js sees no change and the row keeps its detail-page copy.
        event.description = prior.description ?? event.description;
        event.description_html = prior.description_html ?? '';
        event.registration_url = prior.registration_url ?? null;
        event.source_last_modified = prior.source_last_modified ?? sitemapLastModified;
        skipped++;
        continue;
      }

      try {
        const response = await this.politeFetch(event.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        Object.assign(event, parseDetailHtml(await response.text(), event.url));
        event.detail_fetched_at = new Date().toISOString();
        fetched++;
      } catch (error) {
        // One unreachable page shouldn't fail the feed: keep the card-derived copy, leave
        // source_last_modified unrecorded so the next run retries this event.
        console.warn(`  AdaptiveRecHub: detail fetch failed for ${event.url}: ${error.message}`);
        event.source_last_modified = prior?.source_last_modified ?? null;
        failed++;
      }
    }

    const withoutProgram = events.filter((event) => !event.organization_slug).length;
    console.log(
      `  AdaptiveRecHub: ${events.length} events — detail pages ${fetched} fetched, ` +
        `${skipped} unchanged, ${failed} failed; ` +
        `${withoutProgram} without a Program (those fall back to the feed's own org)`,
    );

    return events;
  }

  /** POSTs the list endpoint and unwraps `{success, data: {content}}` into the rendered HTML. */
  async fetchListHtml() {
    // events.js omits empty values rather than sending them, and `latitude=""` is not reliably
    // treated as an absent latitude — so every param here is a real value.
    const body = new URLSearchParams({
      offset: '0',
      limit: String(PAGE_LIMIT),
      latitude: String(this.latitude),
      longitude: String(this.longitude),
      radius: String(this.radiusMiles),
      sort: 'closest',
    });

    const response = await this.politeFetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    // A wrong path here answers 200-shaped-as-404-page rather than failing the fetch, and its
    // body is a full HTML document with no event cards in it — hence checking the status first.
    if (!response.ok) {
      throw new Error(`AdaptiveRecHub events endpoint returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (!payload?.success || typeof payload.data?.content !== 'string') {
      throw new Error('AdaptiveRecHub events endpoint returned an unexpected response shape');
    }

    return payload.data.content;
  }

  /** The rendered list HTML into event shapes, failing loudly when the markup stops matching. */
  parseListHtml(html, feedId) {
    const $ = cheerio.load(html);
    const cards = $('div.event-card.card-item');

    // The canary the spec asks for: the endpoint answering 200 with markup this scraper can't
    // read is the failure mode to catch loudly, since it otherwise looks like a quiet feed.
    if (cards.length === 0) {
      throw new Error(
        `AdaptiveRecHub returned no parseable event cards (${html.length} bytes of HTML) — ` +
          'the endpoint or its markup has probably changed; see scrapers/adaptiverechub-events.md',
      );
    }

    const events = cards.toArray().flatMap((element) => {
      const event = this.normalizeEvent($(element), feedId);
      return event ? [event] : [];
    });

    if (events.length === 0) {
      throw new Error(
        `AdaptiveRecHub returned ${cards.length} event cards but none could be parsed — ` +
          'the card markup has probably changed; see scrapers/adaptiverechub-events.md',
      );
    }

    return events;
  }

  /**
   * `<lastmod>` for the given event URLs, from the site's sitemap.
   *
   * Two things about this site shape the loop:
   *
   *  - **The chunks soft-404.** Every `wp-sitemap-posts-events-N.xml` after the first answers
   *    `HTTP 404` while returning a perfectly good `<urlset>` of 2000 entries. Trusting the status
   *    code here throws away four fifths of the sitemap and leaves every event with a null
   *    lastmod — which silently degrades to re-fetching all ~29 detail pages on every run. So a
   *    chunk is judged by what it parses to, not by its status: a genuine 404 is an HTML error
   *    page, which yields zero entries and is skipped just the same.
   *  - **Our events are in the last chunk.** WordPress fills these in post order, so the newest
   *    events — the only ones a feed of *upcoming* events contains — land at the end. Walking
   *    newest-first typically finds all of them in the first request instead of the fifth, and the
   *    early exit below then skips the rest. At `Crawl-delay: 10` that is 40 seconds a run.
   *
   * A chunk that genuinely fails is skipped rather than fatal: a missing lastmod just makes those
   * events look stale, which costs a detail fetch instead of losing the event.
   */
  async fetchEventLastModified(wantedUrls) {
    const found = new Map();
    if (wantedUrls.size === 0) return found;

    let chunkUrls;
    try {
      const index = await this.politeFetch(SITEMAP_INDEX);
      chunkUrls = parseSitemapIndex(await index.text());
      if (chunkUrls.length === 0) throw new Error(`no event chunks listed (HTTP ${index.status})`);
    } catch (error) {
      console.warn(
        `  AdaptiveRecHub: sitemap index unavailable (${error.message}) — ` +
          'every detail page will be fetched this run',
      );
      return found;
    }

    for (const chunkUrl of chunkUrls.reverse()) {
      try {
        const chunk = await this.politeFetch(chunkUrl);
        const entries = parseUrlSet(await chunk.text());
        if (entries.size === 0) {
          throw new Error(`no <url> entries (HTTP ${chunk.status})`);
        }
        for (const [loc, lastmod] of entries) {
          if (wantedUrls.has(loc)) found.set(loc, lastmod);
        }
      } catch (error) {
        console.warn(`  AdaptiveRecHub: sitemap chunk ${chunkUrl} skipped: ${error.message}`);
      }
      if (found.size === wantedUrls.size) break;
    }

    if (found.size < wantedUrls.size) {
      console.warn(
        `  AdaptiveRecHub: no sitemap lastmod for ${wantedUrls.size - found.size} of ` +
          `${wantedUrls.size} events — those pages get fetched every run until the sitemap lists them`,
      );
    }

    return found;
  }

  /**
   * One `.event-card` into the plain event shape ingest.js upserts. Cards missing a title, url or
   * readable date are dropped (scrape() fails the feed if that happens to all of them); sport and
   * program are genuinely optional per the spec's coverage counts.
   */
  normalizeEvent($card, feedId) {
    const title = $card.find('.title a').text().trim();
    // Recurring occurrences repeat their title across separate posts with -2/-3 url slugs, so the
    // url is the only stable identity here — dedupe on it, never on the title.
    const url = $card.find('.title a').attr('href')?.trim();
    const startTime = parseCardDate($card.find('.date span').text().trim());
    if (!title || !url || !startTime) return null;

    const sport = $card.find('.sport p').text().trim();
    // The Program is usually a link to that org's hub page, but a plain <p> on some cards.
    const $program = $card.find('.program p a');
    const program = ($program.text() || $card.find('.program p').text()).trim();

    // Sport has no column of its own and Program's column is organization_id, so both are also
    // kept verbatim in the description — this is the fallback copy, replaced by the event page's
    // real description as soon as a detail fetch succeeds.
    const description = [sport && `Sport: ${sport}`, program && `Hosted by: ${program}`]
      .filter(Boolean)
      .join('\n');

    return {
      external_id: url,
      title,
      description,
      description_html: '',
      start_time: startTime.toISOString(),
      // The list endpoint exposes no end time, and neither does the detail page.
      end_time: null,
      // One unstructured address string; geocode.js turns it into city/lat/long downstream.
      location: $card.find('.location span').text().trim(),
      url,
      registration_url: null,
      feed_id: feedId,
      // Not columns: ingest.js resolves these into events.organization_id and
      // organizations.source_url. The program href is the org's page on the hub — the one place
      // that links to the org's actual website, which is how the AI pass finds a logo.
      organization_name: program || null,
      organization_slug: program ? slugify(program) : null,
      organization_url: $program.attr('href')?.trim() ?? null,
    };
  }
}

// Debug harness: `node scrapers/adaptiverechub-events.js` prints what a real scrape sees, without
// touching the database. Pass --no-detail to skip the per-event page fetches (and their crawl
// delay) when you only care about the list parse.
if (import.meta.url === `file://${process.argv[1]}`) {
  const skipDetail = process.argv.includes('--no-detail');
  const scraper = new AdaptiveRecHubEventsScraper();

  const events = skipDetail
    ? scraper.parseListHtml(await scraper.fetchListHtml(), 'debug-feed-id')
    : await scraper.scrape('debug-feed-id');

  for (const event of events) {
    console.log(`  ${event.start_time}  ${event.title}  [${event.organization_name ?? '—'}]`);
  }
  console.log(`\nFirst event:\n${JSON.stringify(events[0], null, 2)}`);
}
