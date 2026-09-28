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
 * Anything starting `http://`, `https://` or `www.`. Not a bare `amazon.com`:
 * guessing that "e.g." or "T6.Complete" is not a domain is a game this file
 * would lose, and a link that goes somewhere wrong is worse than one that is
 * not a link. The address is rebuilt with `new URL` and must come out http or
 * https with a dotted host, so nothing typed can become `javascript:`.
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

/** The text in order, with every link found in it split out. */
export function findLinks(text: string): Piece[] {
  const pieces: Piece[] = [];
  let at = 0;
  for (const match of text.matchAll(CANDIDATE)) {
    const start = match.index;
    const candidate = trimEnd(match[0]);
    const href = hrefFor(candidate);
    if (!href) continue;
    if (start > at) pieces.push({ kind: 'text', text: text.slice(at, start) });
    pieces.push({ kind: 'link', href, label: labelFor(href) });
    at = start + candidate.length;
  }
  if (at < text.length) pieces.push({ kind: 'text', text: text.slice(at) });
  return pieces;
}
