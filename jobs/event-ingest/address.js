/**
 * A US address in an event's own words, so an event the map could not place
 * still has a city and state (2026-10-23). Only what the text plainly says:
 * anything unclear is null, never a guess.
 */

import { classifyFormat } from './classify.js';
import { joinPlace } from './scrapers/http.js';
import { stateCode } from './scrapers/us-zones.js';

const COUNTRY = /^(united states( of america)?|usa?)$/i;
const ZIP = /^\d{5}(-\d{4})?$/;
const STREET = /^\d+[A-Za-z]?(-\d+)?\s+[A-Za-z0-9]/;
const UNIT = /^(#|(suite|ste|unit|apt|bldg|building|room|rm|floor|fl)\b)/i;
const CITY = /^[A-Za-z][A-Za-z.'-]*( [A-Za-z][A-Za-z.'-]*){0,3}$/;
const LABEL = /^(location|address|where|venue|place)\s*:\s*/i;
/** Words that name a building, not a town, for a "Venue, ST 12345" with no street. */
const VENUE_WORD =
  /\b(center|centre|campus|gym|church|school|hall|club|hospital|library|arena|stadium|academy|university|college|ymca)\b/i;

/** "GA 30342", "Georgia" or "CA" as { state, zip }; null when it is not one. */
function stateAndZip(part) {
  const m = /^(.*?)(?:\s+(\d{5}(?:-\d{4})?))?$/.exec(part);
  const state = stateCode(m?.[1] ?? '');
  return state ? { state, zip: m?.[2] ?? null } : null;
}

/**
 * "Venue, 4400 Peachtree Dunwoody Rd, Atlanta, GA 30342" as its parts. The
 * city must follow a street (units between are fine) or come before a ZIP.
 */
export function addressInPlace(text) {
  const parts = (text ?? '')
    .split(',')
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (parts.length > 0 && COUNTRY.test(parts.at(-1))) parts.pop();
  if (parts.length > 1 && ZIP.test(parts.at(-1))) {
    const zip = parts.pop();
    parts[parts.length - 1] += ` ${zip}`;
  }
  if (parts.length < 2) return null;

  const tail = stateAndZip(parts.at(-1));
  const city = parts.at(-2);
  if (!tail || !CITY.test(city) || UNIT.test(city)) return null;

  let i = parts.length - 3;
  while (i >= 0 && UNIT.test(parts[i])) i--;
  const street = i >= 0 && STREET.test(parts[i]) ? parts[i] : null;
  if (!street && (!tail.zip || VENUE_WORD.test(city))) return null;
  return {
    venue: street ? joinPlace(...parts.slice(0, i)) || null : null,
    street,
    city,
    state: tail.state,
    zip: tail.zip,
  };
}

/**
 * The one street address a description gives, with its ZIP, and the venue
 * named on its line or the labelled line before it. Null when there is none,
 * or more than one.
 */
export function addressInText(text) {
  const lines = (text ?? '')
    .split('\n')
    .map((line) => line.replace(/^[^\p{L}\p{N}]+/u, '').trim())
    .filter(Boolean);
  const found = new Map();
  lines.forEach((line, index) => {
    const address = addressInPlace(line.replace(LABEL, ''));
    if (!address?.street || !address.zip) return;
    const before = lines[index - 1] ?? '';
    const venue =
      address.venue ??
      (LABEL.test(before) && !/\d/.test(before) ? before.replace(LABEL, '') : null);
    const key = `${address.street}|${address.city}|${address.state}`.toLowerCase();
    if (!found.has(key)) found.set(key, { ...address, venue: venue || null });
  });
  return found.size === 1 ? [...found.values()][0] : null;
}

/**
 * Where an in-person event is, from its own words: the city and state its
 * location ends in, or, when the location is only a venue's name, the address
 * its description gives. Null when neither says.
 */
export function placeInOwnWords(event) {
  if (classifyFormat(event) === 'online') return null;
  const location = (event.location ?? '').trim();
  const own = addressInPlace(location);
  if (own) return { location, city: own.city, state: own.state };
  if (/[\d,]/.test(location)) return null;

  const found = addressInText(event.description);
  if (!found) return null;
  return {
    location: joinPlace(
      location || found.venue,
      found.street,
      found.city,
      `${found.state} ${found.zip}`,
    ),
    city: found.city,
    state: found.state,
  };
}
