import { describe, expect, it } from 'vitest';
import {
  AdaptiveRecHubEventsScraper,
  needsDetailFetch,
  parseDetailHtml,
  parseSitemapIndex,
  parseUrlSet,
} from './adaptiverechub-events.js';

describe('parseSitemapIndex', () => {
  const index = `<?xml version="1.0"?>
    <sitemapindex>
      <sitemap><loc>https://adaptiverechub.org/wp-sitemap-posts-page-1.xml</loc></sitemap>
      <sitemap><loc>https://adaptiverechub.org/wp-sitemap-posts-events-1.xml</loc></sitemap>
      <sitemap><loc>https://adaptiverechub.org/wp-sitemap-posts-events-2.xml</loc></sitemap>
      <sitemap><loc>https://adaptiverechub.org/wp-sitemap-taxonomies-sport_type-1.xml</loc></sitemap>
      <sitemap><loc>https://adaptiverechub.org/wp-sitemap-users-1.xml</loc></sitemap>
    </sitemapindex>`;

  it('keeps only the event chunks', () => {
    expect(parseSitemapIndex(index)).toEqual([
      'https://adaptiverechub.org/wp-sitemap-posts-events-1.xml',
      'https://adaptiverechub.org/wp-sitemap-posts-events-2.xml',
    ]);
  });

  it('ignores pages, taxonomies and users, so a run never crawls the whole site', () => {
    const chunks = parseSitemapIndex(index);
    expect(chunks.some((url) => /page|taxonomies|users/.test(url))).toBe(false);
  });
});

describe('parseUrlSet', () => {
  it('maps each event url to its lastmod', () => {
    const entries = parseUrlSet(`<urlset>
      <url><loc>https://adaptiverechub.org/events/a/</loc><lastmod>2026-08-01T10:00:00+00:00</lastmod></url>
      <url><loc>https://adaptiverechub.org/events/b/</loc><lastmod>2026-08-02T11:30:00+00:00</lastmod></url>
    </urlset>`);

    expect(entries.get('https://adaptiverechub.org/events/a/')).toBe('2026-08-01T10:00:00+00:00');
    expect(entries.get('https://adaptiverechub.org/events/b/')).toBe('2026-08-02T11:30:00+00:00');
  });

  it('records a null lastmod rather than dropping the entry', () => {
    const entries = parseUrlSet(
      '<urlset><url><loc>https://adaptiverechub.org/events/a/</loc></url></urlset>',
    );

    expect(entries.has('https://adaptiverechub.org/events/a/')).toBe(true);
    expect(entries.get('https://adaptiverechub.org/events/a/')).toBeNull();
  });
});

describe('needsDetailFetch', () => {
  it('fetches an event whose page we have never read', () => {
    expect(needsDetailFetch('2026-08-01T10:00:00+00:00', null)).toBe(true);
  });

  it('skips an event the source has not touched since we read it', () => {
    expect(needsDetailFetch('2026-08-01T10:00:00+00:00', '2026-08-01T10:00:00+00:00')).toBe(false);
  });

  it('re-fetches once the source publishes a newer revision', () => {
    expect(needsDetailFetch('2026-08-05T09:00:00+00:00', '2026-08-01T10:00:00+00:00')).toBe(true);
  });

  it('treats a missing lastmod as stale rather than as fresh', () => {
    expect(needsDetailFetch(null, '2026-08-01T10:00:00+00:00')).toBe(true);
  });

  it('treats an unparseable timestamp as stale rather than silently skipping the event', () => {
    expect(needsDetailFetch('not-a-date', '2026-08-01T10:00:00+00:00')).toBe(true);
  });
});

describe('parseDetailHtml', () => {
  const pageUrl = 'https://adaptiverechub.org/events/open-gym-program-12/';
  const page = `<html><body>
    <div class="video-hero__description">
      <p><span>Everyone is welcome to use the equipment at BORP's Fitness Studio.</span></p>
      <p>Admission: Free</p>
      <p>Email <a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="53302a">[email&nbsp;protected]</a> for more</p>
    </div>
    <a class="kbf_primary_btn has_icon" href="https://borp.app.neoncrm.com/np/clients/borp/event.jsp?event=177170">Learn more</a>
    <h2>Our Other Events</h2>
    <a href="https://adaptiverechub.org/events/adaptive-fitness-scruz-4/">Learn More</a>
  </body></html>`;

  it('takes the description from the event page rather than the list card', () => {
    expect(parseDetailHtml(page, pageUrl).description).toContain('Everyone is welcome');
    expect(parseDetailHtml(page, pageUrl).description).toContain('Admission: Free');
  });

  it('captures the registration link behind the "Learn more" button', () => {
    expect(parseDetailHtml(page, pageUrl).registration_url).toBe(
      'https://borp.app.neoncrm.com/np/clients/borp/event.jsp?event=177170',
    );
  });

  it('does not mistake a sibling event\'s "Learn More" for this event\'s registration link', () => {
    const { registration_url: url } = parseDetailHtml(page, pageUrl);
    expect(url).not.toContain('adaptive-fitness-scruz');
  });

  it('ignores a "Learn more" that only points back into the hub', () => {
    const hubOnly = `<div class="video-hero__description"><p>Body</p></div>
      <a class="kbf_primary_btn" href="https://adaptiverechub.org/programs/borp/">Learn more</a>`;

    expect(parseDetailHtml(hubOnly, pageUrl).registration_url).toBeNull();
  });

  it("keeps a Cloudflare-obfuscated email's text without storing its redirector link", () => {
    const { description, description_html: html } = parseDetailHtml(page, pageUrl);

    expect(description).toContain('[email protected]');
    expect(html).not.toContain('cdn-cgi');
  });

  it('returns empty copy when the description block is missing, rather than throwing', () => {
    const result = parseDetailHtml('<html><body><p>nothing here</p></body></html>', pageUrl);

    expect(result.description).toBe('');
    expect(result.description_html).toBe('');
  });
});

describe('AdaptiveRecHubEventsScraper.fetchEventLastModified', () => {
  const INDEX = `<sitemapindex>
    <sitemap><loc>https://adaptiverechub.org/wp-sitemap-posts-events-1.xml</loc></sitemap>
    <sitemap><loc>https://adaptiverechub.org/wp-sitemap-posts-events-2.xml</loc></sitemap>
  </sitemapindex>`;

  const chunk = (loc, lastmod) =>
    `<urlset><url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url></urlset>`;

  /** A scraper with no crawl delay whose fetches are served from `routes`. */
  function scraperServing(routes, log = []) {
    const scraper = new AdaptiveRecHubEventsScraper({ crawlDelayMs: 0 });
    scraper.politeFetch = async (url) => {
      log.push(url);
      const route = routes[url];
      if (!route) return { ok: false, status: 404, text: async () => 'Not Found' };
      return { ok: route.status === 200, status: route.status, text: async () => route.body };
    };
    return scraper;
  }

  it('reads a chunk that soft-404s but still returns a valid urlset', async () => {
    // The real site answers 404 on every event chunk after the first, with 2000 good entries in
    // the body. Trusting the status here leaves every event with a null lastmod, which silently
    // turns the incremental fetch back into a full crawl on every run.
    const scraper = scraperServing({
      'https://adaptiverechub.org/wp-sitemap.xml': { status: 200, body: INDEX },
      'https://adaptiverechub.org/wp-sitemap-posts-events-2.xml': {
        status: 404,
        body: chunk('https://adaptiverechub.org/events/a/', '2026-08-01T10:00:00+00:00'),
      },
    });

    const found = await scraper.fetchEventLastModified(
      new Set(['https://adaptiverechub.org/events/a/']),
    );

    expect(found.get('https://adaptiverechub.org/events/a/')).toBe('2026-08-01T10:00:00+00:00');
  });

  it('ignores a genuine 404, which is an HTML page with no url entries', async () => {
    const scraper = scraperServing({
      'https://adaptiverechub.org/wp-sitemap.xml': { status: 200, body: INDEX },
    });

    const found = await scraper.fetchEventLastModified(
      new Set(['https://adaptiverechub.org/events/a/']),
    );

    expect(found.size).toBe(0);
  });

  it('walks newest-first and stops as soon as every wanted url is found', async () => {
    const log = [];
    const scraper = scraperServing(
      {
        'https://adaptiverechub.org/wp-sitemap.xml': { status: 200, body: INDEX },
        'https://adaptiverechub.org/wp-sitemap-posts-events-2.xml': {
          status: 404,
          body: chunk('https://adaptiverechub.org/events/a/', '2026-08-01T10:00:00+00:00'),
        },
      },
      log,
    );

    await scraper.fetchEventLastModified(new Set(['https://adaptiverechub.org/events/a/']));

    // Upcoming events are the newest posts, so they sit in the last chunk — chunk 1 is never read.
    expect(log).not.toContain('https://adaptiverechub.org/wp-sitemap-posts-events-1.xml');
  });

  it('returns nothing when the index itself is unreadable, rather than throwing', async () => {
    const scraper = scraperServing({});

    await expect(
      scraper.fetchEventLastModified(new Set(['https://adaptiverechub.org/events/a/'])),
    ).resolves.toEqual(new Map());
  });
});

describe('AdaptiveRecHubEventsScraper.normalizeEvent', () => {
  const scraper = new AdaptiveRecHubEventsScraper();

  /** Parses a card the same way scrape() does, via the list-HTML entry point. */
  function firstEvent(cardHtml) {
    return scraper.parseListHtml(`<div>${cardHtml}</div>`, 'feed-1')[0];
  }

  const card = `<div class="event-card card-item">
    <h4 class="title"><a href="https://adaptiverechub.org/events/open-gym-program-12/">Open Gym Program</a></h4>
    <div class="date"><p><span>08/20/26 4:30 PM</span></p></div>
    <div class="location"><p><span>Ed Roberts Campus, Berkeley, CA 94703</span></p></div>
    <div class="sport"><p>Fitness</p></div>
    <div class="program"><p><a href="https://adaptiverechub.org/programs/bay-area-outreach-and-recreation-program/">BORP Adaptive Sports</a></p></div>
  </div>`;

  it("captures the program link as the organization's page on the hub", () => {
    expect(firstEvent(card).organization_url).toBe(
      'https://adaptiverechub.org/programs/bay-area-outreach-and-recreation-program/',
    );
  });

  it('slugifies the program name into an organization slug', () => {
    const event = firstEvent(card);

    expect(event.organization_name).toBe('BORP Adaptive Sports');
    expect(event.organization_slug).toBe('borp-adaptive-sports');
  });

  it('reads a card date as Pacific wall-clock time', () => {
    // 4:30 PM PDT on 2026-08-20 is 23:30 UTC.
    expect(firstEvent(card).start_time).toBe('2026-08-20T23:30:00.000Z');
  });

  it('handles a Program that is plain text rather than a link', () => {
    const event = firstEvent(card.replace(/<a href="[^"]*">BORP Adaptive Sports<\/a>/, 'Solo Org'));

    expect(event.organization_name).toBe('Solo Org');
    expect(event.organization_url).toBeNull();
  });

  it('throws rather than reporting an empty feed when the card markup stops matching', () => {
    expect(() => scraper.parseListHtml('<div><article>changed</article></div>', 'feed-1')).toThrow(
      /no parseable event cards/,
    );
  });
});
