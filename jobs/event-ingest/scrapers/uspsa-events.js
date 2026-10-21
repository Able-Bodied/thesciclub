/**
 * US Power Soccer Association tournaments, from its Webflow calendar
 * (feed_url): each card gives a title, a city and the first day; the event's
 * own page gives the last day, the venue and its street.
 *
 * Dates have no hours, so each is all day. Cities come without a state, so
 * days are counted in the club's zone, which keeps each on its own date.
 */

import * as cheerio from 'cheerio';
import { allDayInstants, parseDayRange } from './day-ranges.js';
import { fetchText, joinPlace } from './http.js';

const ZONE = 'America/Los_Angeles';

export function parseCards(html, baseUrl) {
  const $ = cheerio.load(html);
  const cards = [];
  const seen = new Set();
  $('a.event_block[href^="/events/"]').each((_, a) => {
    const card = $(a);
    const href = new URL(card.attr('href'), baseUrl).toString();
    if (seen.has(href)) return;
    seen.add(href);
    cards.push({
      url: href,
      title: card.find('.event_name').text().replace(/\s+/g, ' ').trim(),
      city: card.find('.event_name').parent().children('div').eq(2).text().trim(),
      date: card.find('[fs-cmssort-field="date"]').text().trim(),
    });
  });
  if ($('.event_block').length > 0 && cards.length === 0) {
    throw new Error('USPSA: the calendar cards have changed.');
  }
  return cards;
}

/** The detail page's date line and its venue lines. */
export function parseDetail(html) {
  const $ = cheerio.load(html);
  const items = $('.event-item-header11_metatag-item');
  const date = items
    .eq(0)
    .children('div')
    .slice(1)
    .map((_, d) => $(d).text().trim())
    .get()
    .join(' ');
  const venue = items
    .eq(1)
    .children('div')
    .last()
    .children('div')
    .map((_, d) => $(d).text().trim())
    .get()
    .filter(Boolean);
  return { date, venue };
}

export function toEvent(card, detail) {
  const fromCard = parseDayRange(card.date);
  const fromPage = detail ? parseDayRange(detail.date) : null;
  // The page is the fuller source, but some pages still carry last year's
  // dates: trust it only when its first day is the card's.
  const days = fromPage && fromCard && fromPage.first === fromCard.first ? fromPage : fromCard;
  if (!days || !card.title) return null;
  const venue = fromPage && days === fromPage ? (detail?.venue ?? []) : [];
  return {
    external_id: `uspsa:${card.url.split('/').pop()}`,
    title: card.title,
    description: 'A power soccer tournament. Teams enter through USPSA; anyone can come and watch.',
    description_html:
      '<p>A power soccer tournament. Teams enter through USPSA; anyone can come and watch.</p>',
    location: joinPlace(...venue, card.city),
    ...allDayInstants(days, ZONE),
    all_day: true,
    timezone: null,
    url: card.url,
    registration_url: null,
    host_name: null,
  };
}

export class UspsaEventsScraper {
  constructor(feed) {
    this.url = feed.feed_url;
  }

  async scrape() {
    const cards = parseCards(await fetchText(this.url), this.url);
    const events = [];
    for (const card of cards) {
      let detail = null;
      try {
        detail = parseDetail(await fetchText(card.url));
      } catch (e) {
        console.log(`  ! USPSA: ${card.url}: ${e.message}`);
      }
      const event = toEvent(card, detail);
      if (event) events.push(event);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return events;
  }
}
