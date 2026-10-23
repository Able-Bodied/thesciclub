/**
 * Where an invitation's event is: its physical place, its link, whether it
 * is online, and the city and state its address names. Calendars glue a
 * meeting link into LOCATION; the club keeps the two apart. Pure, and
 * mirrored by private.calendar_where (20261023000000).
 */

export type Format = 'in_person' | 'online' | 'hybrid';

export interface Where {
  place: string;
  link: string | null;
  /** Null when there is neither a place nor a link: the database decides. */
  format: Format | null;
  city: string | null;
  /** Two letters. */
  state: string | null;
}

const URL_IN_TEXT = /https?:\/\/[^\s;,<>"'()[\]]+/gi;
const MEETING_HOST =
  /^https:\/\/([a-z0-9-]+\.)*(meet\.google\.com|zoom\.us|zoomgov\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com)(\/|$)/i;
/** What Outlook and others write as a place for a call. */
const CALL_LABEL =
  /^(microsoft teams( meeting)?|teams meeting|zoom( meeting)?|google meet|webex( meeting)?|online( meeting)?|virtual|video call)$/i;
const SEPARATORS = /^[\s,;|·–-]+|[\s,;|·–-]+$/g;

const STATES: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  'district of columbia': 'DC',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
};
const CODES = new Set(Object.values(STATES));
const COUNTRY_US = /^(usa|us|u\.s\.a?\.?|united states( of america)?)$/i;
const ZIP = /^\d{5}(-\d{4})?$/;
const CITY = /^[A-Za-z][A-Za-z .'-]{0,59}$/;

/** A code as written (upper case), or, with a ZIP or country beside it, a state's name. */
function stateCode(words: string, named: boolean): string | null {
  if (CODES.has(words)) return words;
  return named ? (STATES[words.toLowerCase()] ?? null) : null;
}

/** https links in some text, without trailing punctuation. */
export function linksIn(text: string): string[] {
  return (text.match(URL_IN_TEXT) ?? []).map((url) => url.replace(/[.:!?]+$/, ''));
}

export function isMeetingLink(url: string): boolean {
  return MEETING_HOST.test(url);
}

/**
 * The city and state of a US address, `…, City, ST 12345[, USA]`, or null.
 * Never a guess: no state, another country, or no clear city is null.
 */
export function cityOf(place: string): { city: string; state: string } | null {
  const parts = place
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  let named = false;
  if (COUNTRY_US.test(parts.at(-1) ?? '')) named = Boolean(parts.pop());
  if (ZIP.test(parts.at(-1) ?? '')) named = Boolean(parts.pop());
  const words = (parts.pop() ?? '').split(/\s+/).filter(Boolean);
  if (ZIP.test(words.at(-1) ?? '')) named = Boolean(words.pop());
  for (let take = Math.min(3, words.length); take >= 1; take -= 1) {
    const state = stateCode(words.slice(-take).join(' '), named);
    if (!state) continue;
    const inline = words.slice(0, -take).join(' ');
    const city = inline || (parts.at(-1) ?? '');
    return CITY.test(city) ? { city, state } : null;
  }
  return null;
}

/**
 * From LOCATION, the invitation's own URL, its conference links (Google's
 * X-GOOGLE-CONFERENCE, Teams') and its description.
 */
export function whereOf(input: {
  location: string;
  url: string | null;
  conference: string[];
  description: string;
}): Where {
  const fromPlace = linksIn(input.location);
  const pieces = input.location
    .replace(URL_IN_TEXT, '')
    .split(/[;\n|]/)
    .map((piece) => piece.replace(/\s+/g, ' ').replace(SEPARATORS, ''))
    .filter((piece) => piece && !CALL_LABEL.test(piece));
  const place = pieces.join(', ').slice(0, 300);

  const meeting = [...input.conference.flatMap(linksIn), ...linksIn(input.description)].find(
    isMeetingLink,
  );
  const link = fromPlace.find(isMeetingLink) ?? fromPlace[0] ?? meeting ?? input.url ?? null;

  const format: Format | null = place
    ? fromPlace.some(isMeetingLink)
      ? 'hybrid'
      : 'in_person'
    : link
      ? 'online'
      : null;

  const found = format === 'online' || !place ? null : cityOf(place);
  return {
    place,
    link: link && link.length <= 2000 ? link : null,
    format,
    city: found?.city ?? null,
    state: found?.state ?? null,
  };
}
