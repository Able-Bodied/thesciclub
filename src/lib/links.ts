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
 * Only the shape that is plainly one: a number, a capitalised street name of
 * up to four words, and a street word (St, Avenue, Blvd…). "I did 3 laps" and
 * "2 big dogs" are not addresses; "Meet at 1200 Valencia St" is. A unit, a
 * city and a US state with its ZIP code are kept when they follow, since they
 * are what pins the right spot. A state is only one of the real two letters,
 * so "123 Main St, Oakland OK" ends where it should and capitals that happen
 * to follow do not ride along.
 */
const STREET_WORD =
  '(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Parkway|Pkwy|Highway|Hwy|Terrace|Ter|Circle|Cir|Square|Sq|Trail|Trl|Plaza|Plz|Alley|Loop)';
const NAME_WORD = "(?:[A-Z][A-Za-z'’-]*\\.?|\\d+(?:st|nd|rd|th))";
const POINT = '(?:N|S|E|W|NE|NW|SE|SW|North|South|East|West)';
const STATES =
  'AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY';
const ADDRESS = new RegExp(
  [
    '\\b\\d{1,6}[A-Z]?',
    `(?:\\s+${NAME_WORD}){1,4}?`,
    `\\s+${STREET_WORD}\\b\\.?`,
    `(?:\\s+${POINT}(?![A-Za-z]))?`,
    '(?:,?\\s+(?:Suite|Ste\\.?|Apt\\.?|Unit|#)\\s*[A-Za-z0-9-]+)?',
    "(?:,\\s*[A-Z][A-Za-z.'’-]*(?:\\s+[A-Z][a-z][A-Za-z.'’-]*){0,2}(?=,?\\s+(?:" +
      STATES +
      ')\\b))?',
    `(?:,?\\s+(?:${STATES})\\b(?:\\s+\\d{5}(?:-\\d{4})?)?)?`,
  ].join(''),
  'g',
);

/** Google Maps for an address a member wrote. */
export function mapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** Words with the street addresses in them split out as links to a map. */
function withAddresses(text: string, pieces: Piece[]) {
  let at = 0;
  for (const match of text.matchAll(ADDRESS)) {
    const address = match[0];
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
