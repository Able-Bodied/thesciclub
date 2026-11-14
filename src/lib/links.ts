/**
 * Links in what members write: found, made safe, and shortened for reading.
 *
 * Asked for by the owner, 2026-09-27 — "make links clickable, like Amazon
 * links". Somebody recommending a cushion pastes the whole address, and until
 * now the other member had to copy it out of a bubble on a phone.
 *
 * ---------------------------------------------------------------------------
 * What counts as a link
 * ---------------------------------------------------------------------------
 * Anything starting `http://`, `https://` or `www.`. A bare `amazon.com` too
 * (the owner, 2026-11-10), but only when it ends in a web ending on the list
 * below: "e.g." and "T6.Complete" do not, so they stay words. The address is
 * rebuilt with `new URL` and must come out http or https with a dotted host,
 * so nothing typed can become `javascript:`.
 *
 * An email address opens a new email, and a US phone number written in
 * groups (408-555-1234, (408) 555-1234, +1 408 555 1234) starts a call
 * (the owner, 2026-11-10). A run of digits alone is not a phone number.
 *
 * Punctuation that ends a sentence is not part of the address: "see
 * https://example.com/x." links to /x. A closing bracket is kept only when the
 * address opened one, so a Wikipedia link with (parentheses) survives and
 * "(see https://example.com)" does not swallow the bracket.
 *
 * ---------------------------------------------------------------------------
 * What the member reads
 * ---------------------------------------------------------------------------
 * An Amazon address is two hundred characters, most of them tracking. The
 * label drops the scheme, the `www.`, and — when it is long — the query, then
 * cuts to LABEL_LENGTH with an ellipsis: `amazon.com/ROHO-Cushion/dp/B00…`.
 * The full address is still the href, and the title for anybody who hovers.
 */

export const LABEL_LENGTH = 48;

export type Piece = { kind: 'text'; text: string } | { kind: 'link'; href: string; label: string };

const CANDIDATE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;

/** Web endings a bare address must end in. Not `it`, `me` or `in`: "got.it". */
const ENDINGS =
  'com|org|net|edu|gov|mil|io|co|us|info|biz|app|dev|tv|ly|ai|ca|uk|au|nz|de|fr|es|nl|mx|health|news|shop|store|online|site|tech|club|link|page|fit|gg';
const EMAIL = '[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\\.)+[A-Za-z]{2,}';
const PHONE = '(?:\\+?1[\\s.-]?)?(?:\\(\\d{3}\\)\\s?|\\d{3}[\\s.-])\\d{3}[\\s.-]\\d{4}';
const BARE = `(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\\.)+(?:${ENDINGS})(?:\\/[^\\s<>"]*)?`;
const OTHER = new RegExp(
  `(?<![\\w.+@/-])(?:(?<email>${EMAIL})|(?<phone>${PHONE})|(?<bare>${BARE}))(?![\\w@-])`,
  'gi',
);
const TRAILING = /[.,;:!?'"’”)\]}>]$/;

/** Strip sentence punctuation off the end, and a bracket the address did not open. */
function trimEnd(candidate: string): string {
  let value = candidate;
  while (TRAILING.test(value)) {
    const last = value.slice(-1);
    if (last === ')') {
      const opened = (value.match(/\(/g) ?? []).length;
      const closed = (value.match(/\)/g) ?? []).length;
      if (closed <= opened) break;
    }
    value = value.slice(0, -1);
  }
  return value;
}

/** The address to open, or null when it is not a safe web address. */
export function hrefFor(candidate: string): string | null {
  const withScheme = /^www\./i.test(candidate) ? `https://${candidate}` : candidate;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname.includes('.')) return null;
  return url.href;
}

/** What the member reads in place of the whole address. */
export function labelFor(href: string): string {
  const url = new URL(href);
  const host = url.hostname.replace(/^www\./i, '');
  const path = url.pathname === '/' ? '' : url.pathname;
  let label = `${host}${path}${url.search}${url.hash}`;
  if (label.length > LABEL_LENGTH) label = `${host}${path}`;
  if (label.length > LABEL_LENGTH) label = `${label.slice(0, LABEL_LENGTH - 1)}…`;
  return label;
}

/*
 * ---------------------------------------------------------------------------
 * Street addresses
 * ---------------------------------------------------------------------------
 * A street address opens Google Maps (the owner, 2026-11-09), as an event's
 * place does (routes/events/place.ts). The member reads the address as they
 * wrote it; only the tap is new.
 *
 * The shape: a number, a street name of up to four words, and a street word
 * (St, Avenue, Blvd…), in any case, since members type "1600 pennsylvania
 * ave" (the owner, 2026-11-12). "I did 3 laps" and "2 big dogs" have no street
 * word; "5 miles down the road" has one, so a name word may never be a common
 * word (STOP). An all-lowercase name before a word that is also plain English
 * (way, place, drive…) needs a city, state or ZIP after it: "1 long way".
 *
 * What follows is kept when it pins the spot: a unit, then a city and state
 * (commas optional, on the next line too), a ZIP, or a capitalised city alone
 * at the end of a sentence. A state in capitals counts anywhere; "ca" or "ok"
 * only after a city and with a ZIP or at the very end, so "12 main st ok"
 * does not send the map to Oklahoma.
 */
const STREET_WORD =
  'Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Parkway|Pkwy|Highway|Hwy|Terrace|Ter|Circle|Cir|Square|Sq|Trail|Trl|Plaza|Plz|Alley|Loop';
const LOOSE_STREET =
  /^(?:way|drive|dr|lane|ln|court|ct|place|pl|square|sq|circle|cir|trail|trl|loop|terrace|ter|plaza|plz|alley)$/i;
const STOP = new Set(
  (
    'a an the and or but to of in on at by for from with into onto down up over under around ' +
    'across along past through near my your our their his her its this that these those some ' +
    'more most many few other same long short big small little few laps lap miles mile km ' +
    'blocks block times minutes hours days weeks months years people kids guys is are was were ' +
    'be been i we you he she they it me us them'
  ).split(' '),
);
const WORD = "[A-Za-z][A-Za-z'’-]*|[A-Za-z]\\.|\\d+(?:st|nd|rd|th)";
const POINT = 'N|S|E|W|NE|NW|SE|SW|North|South|East|West';
const STATES =
  'AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY';
const PLACE_WORD = "[A-Za-z][A-Za-z.'’-]*";
/** A city ending a sentence: no dot, or it would take the full stop. */
const CITY_WORD = "[A-Za-z][A-Za-z'’-]*";
const ZIP = '\\d{5}(?:-\\d{4})?';
const ADDRESS = new RegExp(
  [
    '\\b\\d{1,6}(?:-\\d{1,4})?[A-Za-z]?',
    `(?<name>(?:\\s+(?:${WORD})){1,4}?)`,
    `\\s+(?<street>${STREET_WORD})\\b\\.?`,
    `(?<point>\\s+(?:${POINT})(?![A-Za-z]))?`,
    '(?:,?\\s+(?:Suite|Ste\\.?|Apt\\.?|Unit|#)\\s*[A-Za-z0-9-]+)?',
    '(?<tail>',
    `(?:,?\\s+(?<city>${PLACE_WORD}(?:\\s+${PLACE_WORD}){0,2}?))?,?\\s+(?<state>${STATES})\\b(?:\\s+(?<zip>${ZIP}))?`,
    `|,?\\s+(?<zipOnly>${ZIP})\\b`,
    `|,\\s*(?<cityOnly>${CITY_WORD}(?:\\s+${CITY_WORD}){0,2})(?=\\s*(?:$|[.!?\\n]))`,
    ')?',
  ].join(''),
  'gi',
);

const words = (text: string | undefined) => (text ?? '').trim().split(/\s+/).filter(Boolean);
const common = (word: string) => STOP.has(word.replace(/\.$/, '').toLowerCase());

/** The address in a match, without a tail that does not hold up, or null for none. */
function addressIn(match: RegExpExecArray, text: string): string | null {
  const { name, street = '', point, tail, city, state, zip, cityOnly } = match.groups ?? {};
  const names = words(name);
  if (names.some(common)) return null;
  let keepTail = Boolean(tail);
  if (state) {
    const atEnd = !/[A-Za-z0-9]/.test(text.slice(match.index + match[0].length));
    const capitals = state === state.toUpperCase();
    keepTail =
      !words(city).some(common) && (capitals || (Boolean(city) && (Boolean(zip) || atEnd)));
  } else if (cityOnly) {
    keepTail = words(cityOnly).every((word) => /^[A-Z]/.test(word) && !common(word));
  }
  const core = tail ? match[0].slice(0, match[0].length - tail.length) : match[0];
  const lowercase = !names.some((word) => /^[A-Z]/.test(word));
  if (lowercase && LOOSE_STREET.test(street) && !point && !keepTail) return null;
  return keepTail ? match[0] : core;
}

/** Google Maps for an address a member wrote. */
export function mapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.replace(/\s+/g, ' '))}`;
}

/** Words with the street addresses in them split out as links to a map. */
function withAddresses(text: string, pieces: Piece[]) {
  let at = 0;
  for (const match of text.matchAll(ADDRESS)) {
    const address = addressIn(match, text);
    if (!address) continue;
    if (match.index > at) pieces.push({ kind: 'text', text: text.slice(at, match.index) });
    pieces.push({ kind: 'link', href: mapsHref(address), label: address });
    at = match.index + address.length;
  }
  if (at < text.length) pieces.push({ kind: 'text', text: text.slice(at) });
}

/** A phone number as a tel: address, +1 and its ten digits. */
function telHref(written: string): string | null {
  const digits = written.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return ten.length === 10 ? `tel:+1${ten}` : null;
}

/** Emails, phone numbers and bare addresses split out; the rest goes on to addresses. */
function withOthers(text: string, pieces: Piece[]) {
  let at = 0;
  for (const match of text.matchAll(OTHER)) {
    const { email, phone, bare } = match.groups ?? {};
    let written = match[0];
    let href: string | null = null;
    let label = written;
    if (email) href = `mailto:${email}`;
    else if (phone) href = telHref(phone);
    else if (bare) {
      written = trimEnd(bare);
      href = hrefFor(`https://${written}`);
      if (href) label = labelFor(href);
    }
    if (!href) continue;
    if (match.index > at) withAddresses(text.slice(at, match.index), pieces);
    pieces.push({ kind: 'link', href, label });
    at = match.index + written.length;
  }
  if (at < text.length) withAddresses(text.slice(at), pieces);
}

/** The text in order, with every link (and street address) found in it split out. */
export function findLinks(text: string): Piece[] {
  const pieces: Piece[] = [];
  let at = 0;
  for (const match of text.matchAll(CANDIDATE)) {
    const start = match.index;
    const candidate = trimEnd(match[0]);
    const href = hrefFor(candidate);
    if (!href) continue;
    if (start > at) withOthers(text.slice(at, start), pieces);
    pieces.push({ kind: 'link', href, label: labelFor(href) });
    at = start + candidate.length;
  }
  if (at < text.length) withOthers(text.slice(at), pieces);
  return pieces;
}
