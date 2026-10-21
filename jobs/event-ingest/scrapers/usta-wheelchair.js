/**
 * USTA's wheelchair tennis tournaments, from the search behind
 * playtennis.usta.com (feed_url), filtered to the "wheelchair" level.
 *
 * A tournament published as whole days (midnight to 23:59 where it is) is
 * all day. Every one has a venue, so each keeps its own zone.
 */

import { fetchJson, joinPlace } from './http.js';
import { zonedParts } from './timezone.js';
import { ianaZone } from './tribe-events.js';

const PUBLIC = 'https://playtennis.usta.com/Competitions';

/** "GOLD RIVER" → "Gold River"; mixed case is left as typed. */
const town = (name) =>
  name && name === name.toUpperCase()
    ? name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : (name ?? '');

function wholeDays(startIso, endIso, zone) {
  if (!zone || !endIso) return false;
  const start = zonedParts(new Date(startIso), zone);
  const end = zonedParts(new Date(endIso), zone);
  return start.hour === 0 && start.minute === 0 && end.hour === 23 && end.minute === 59;
}

export function toEvent(item) {
  if (item.isCancelled) return null;
  const zone = ianaZone(item.timeZone);
  const place = item.primaryLocation ?? {};
  const url = item.organization?.urlSegment
    ? `${PUBLIC}/${item.organization.urlSegment}/Tournaments/Overview/${item.id}`
    : null;
  return {
    external_id: `usta:${item.id}`,
    title: item.name.replace(/\s+/g, ' ').trim(),
    description: item.organization?.name ? `Hosted by ${item.organization.name}.` : '',
    description_html: item.organization?.name
      ? `<p>Hosted by ${item.organization.name.replace(/[<>&]/g, '')}.</p>`
      : '',
    location: joinPlace(
      place.address1,
      town(place.town),
      [place.county, place.postcode].filter(Boolean).join(' '),
    ),
    start_time: new Date(item.startDateTime).toISOString(),
    end_time: item.endDateTime ? new Date(item.endDateTime).toISOString() : null,
    all_day: wholeDays(item.startDateTime, item.endDateTime, zone),
    timezone: zone,
    url,
    registration_url: url,
    host_name: item.organization?.name ?? null,
  };
}

export class UstaWheelchairScraper {
  constructor(feed) {
    this.url = feed.feed_url;
  }

  async scrape() {
    const now = new Date();
    const until = new Date(now.getTime() + 400 * 86_400_000);
    const body = await fetchJson(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        options: { size: 100, from: 0, sortKey: 'date', latitude: 0, longitude: 0 },
        filters: [
          {
            key: 'date-range',
            items: [{ minDate: now.toISOString(), maxDate: until.toISOString() }],
          },
          { key: 'level-category', items: [{ value: 'wheelchair' }] },
        ],
      }),
    });
    if (!Array.isArray(body.searchResults))
      throw new Error('USTA: no searchResults in the answer.');
    return body.searchResults.map((r) => toEvent(r.item)).filter(Boolean);
  }
}
