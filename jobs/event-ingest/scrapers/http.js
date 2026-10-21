/**
 * Fetching for the scrapers added 2026-10-20, as the club's import says who
 * it is. Several of these sites (SiteGround, mod_security, Cloudflare) refuse
 * a browser-looking agent that lacks a browser's other headers, and accept
 * this one.
 */

export const USER_AGENT = 'thesciclub-event-ingest/1.0 (+https://www.thesciclub.com)';

export async function fetchText(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`${url} answered ${res.status}.`);
  return res.text();
}

export async function fetchJson(url, init = {}) {
  return JSON.parse(await fetchText(url, init));
}

/** Today in a zone, as YYYY-MM-DD. */
export function dayIn(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

/** The day `days` after a YYYY-MM-DD. */
export function addDays(day, days) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** A feed option that is a pattern, as a case-blind RegExp, or null. */
export function patternOption(options, key) {
  const value = options?.[key];
  return typeof value === 'string' && value !== '' ? new RegExp(value, 'i') : null;
}

/** "Venue, 1 Main St, Town, ST 12345", skipping what is missing. */
export function joinPlace(...parts) {
  return parts
    .map((part) => (typeof part === 'string' ? part.replace(/\s+/g, ' ').trim() : ''))
    .filter(Boolean)
    .join(', ');
}
