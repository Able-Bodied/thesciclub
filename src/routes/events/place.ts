import type { ClubEvent } from '@/types/domain';

/**
 * Turning a feed's location field into the one line a card can show.
 *
 * `ClubEvent.location` is free text, exactly as the feed wrote it, and across
 * the 124 ingested events it is one of three things: a long postal address
 * with the country on the end ("Archer Bicycle 431 13th Street Oakland,
 * California, 94607 United States"), a bare street address, or empty — which
 * is the common case at 89 of 124.
 *
 * Printing it verbatim put ninety-five characters of it in the smallest text on
 * the card, wrapped over three lines on a phone, and repeated the city, which
 * the card already shows from the clean geocoded column. The useful token is
 * the venue's name, and it is nearly always the fragment before the street
 * number.
 *
 * Nothing here rewrites the stored value. `location` stays the feed's own words
 * in the database; this is only how they are read out.
 */

/**
 * An Open Location Code, e.g. "QG9J+VH6 Golden Gate Park". One real event
 * carries one. It is a machine's answer to "where" and means nothing to a
 * reader, so it comes off the front.
 */
const PLUS_CODE = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/i;

/** The tail nobody in California needs: country, state, postcode. */
const COUNTRY = /,?\s*(United States|USA?|US)\s*$/i;
const STATE_POSTCODE = /,?\s+(California|CA),?(\s+\d{5}(-\d{4})?)?\s*$/i;

/** A unit within a building, which never helps at a glance. */
const UNIT = /\s+(Suite|Ste\.?|Unit|#)\s*\S*\s*$/i;

/**
 * The raw string with the noise trimmed off the ends, and nothing else touched.
 *
 * This is the floor: when no venue name can be found, the reader still gets the
 * street rather than nothing. A first pass returned null here instead, which
 * rendered six real events with no location line at all — worse than the
 * address it was trying to improve.
 */
export function tidyLocation(raw: string | null | undefined): string {
  let value = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!value) return '';

  value = value.replace(PLUS_CODE, '').trim();
  // Twice: "…, California, 94607 United States" sheds the country, which
  // uncovers the state and postcode behind it.
  for (let pass = 0; pass < 2; pass += 1) {
    value = value.replace(COUNTRY, '').replace(STATE_POSTCODE, '').trim();
  }
  return value.replace(/[,\s]+$/, '');
}

/**
 * The venue's name, when the string begins with one.
 *
 * "Archer Bicycle 431 13th Street…" is a name followed by an address, so the
 * cut is at the first street number. A string that opens with a digit is an
 * address with no name in front of it, and there is nothing to return.
 */
export function venueName(raw: string | null | undefined): string | null {
  const tidied = tidyLocation(raw);
  if (!tidied) return null;

  const firstSegment = (tidied.split(',')[0] ?? '').trim();
  const beforeNumber = /^(.*?)\s+\d/.exec(firstSegment);
  const name = beforeNumber?.[1]?.trim() ?? (/^\d/.test(firstSegment) ? '' : firstSegment);

  return name.replace(UNIT, '').trim() || null;
}

/** What a card or a detail hero prints for "where", or null for nothing. */
export function placeLine(event: Pick<ClubEvent, 'location' | 'city' | 'format'>): string | null {
  const head = venueName(event.location) ?? tidyLocation(event.location);

  if (!head) {
    // An online event has no venue and should not be made to look like it is
    // missing one — the format badge already answers the question. Everything
    // else with an empty field is a real gap, and hybrid belongs here too: it
    // has a physical leg and the feed did not say where.
    if (event.format === 'online') return null;
    if (event.city) return event.city;
    return 'Location on the organizer’s page';
  }

  // The city is already inside most of these addresses. Appending the geocoded
  // one as well printed it twice, a line apart, on every card.
  if (event.city && !head.toLowerCase().includes(event.city.toLowerCase())) {
    return `${head} · ${event.city}`;
  }
  return head;
}
