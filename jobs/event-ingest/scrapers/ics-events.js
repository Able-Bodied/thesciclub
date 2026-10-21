/**
 * Any public .ics calendar (feed_url), its repeating events expanded for the
 * next `days` (option, default 60) so each occurrence is its own event.
 *
 * Options: `include`/`exclude` title patterns, `host_name`, `days`, and
 * `group_days`, for a calendar that lists each day of a tournament as its own
 * all-day entry (NWBA's): consecutive days of one title become one event;
 * `description`, in place of a calendar's own when that says nothing.
 * An occurrence somewhere real keeps the calendar's zone; one online (no
 * place, or Zoom, a link, "virtual") is read in the club's time, so a 2pm
 * Eastern call shows as 11am.
 */

import { addDays, dayIn, fetchText, patternOption } from './http.js';
import { expandIcs, parseIcs } from './ics.js';
import { convertRichText } from './rich-text.js';
import { ianaZone } from './tribe-events.js';

const ONLINE = /zoom|virtual|online|webinar|teams|^https?:\/\//i;

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A web address and nothing after it: not a closing bracket or full stop. */
const ADDRESS = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]]/g;

/**
 * Plain .ics text as paragraphs, its web addresses as links, through the same
 * cleaning as every other description (rich-text.js), so a Zoom link can be
 * pressed.
 */
export function asHtml(text, baseUrl) {
  const html = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p>${escapeHtml(p)
          .replace(ADDRESS, (url) => `<a href="${url}">${url}</a>`)
          .replace(/\n/g, '<br>')}</p>`,
    )
    .join('');
  return convertRichText(html, baseUrl).html;
}

export function icsEvents(text, { fromDay, untilDay, options = {}, onUnsupported } = {}) {
  const include = patternOption(options, 'include');
  const exclude = patternOption(options, 'exclude');
  const occurrences = expandIcs(parseIcs(text), fromDay, untilDay, onUnsupported);
  const out = [];
  for (const { event, day, start, end } of occurrences) {
    const title = (event.summary ?? '').trim();
    if (!title || (include && !include.test(title)) || exclude?.test(title)) continue;
    const location = (event.location ?? '').trim();
    const inPerson = location !== '' && !ONLINE.test(location);
    const description = options.description ?? event.description ?? '';
    out.push({
      external_id: `ics:${event.uid ?? title}:${day}`,
      title,
      description,
      description_html: asHtml(description, event.url ?? 'https://www.thesciclub.com/'),
      location: inPerson ? location : '',
      start_time: start.toISOString(),
      end_time: end ? end.toISOString() : null,
      all_day: event.start.dateOnly,
      timezone: inPerson || event.start.dateOnly ? ianaZone(event.start.zone) : null,
      url: event.url ?? (event.description ?? '').match(/https?:\/\/\S+/)?.[0] ?? null,
      registration_url: null,
      host_name: options.host_name ?? null,
    });
  }
  return options.group_days ? groupDays(out) : out;
}

/** Consecutive all-day entries of one title as a single event, keyed by its first. */
function groupDays(events) {
  const out = [];
  for (const event of events) {
    const last = out.findLast((e) => e.title === event.title && e.all_day && event.all_day);
    if (
      last &&
      last.end_time &&
      Date.parse(event.start_time) - Date.parse(last.end_time) <= 60_000
    ) {
      last.end_time = event.end_time;
      continue;
    }
    out.push({ ...event });
  }
  return out;
}

export class IcsEventsScraper {
  constructor(feed) {
    this.url = feed.feed_url;
    this.options = feed.options ?? {};
  }

  async scrape() {
    const fromDay = dayIn('America/Los_Angeles');
    const untilDay = addDays(fromDay, Number(this.options.days) || 60);
    const text = await fetchText(this.url);
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error(`${this.url} is not a calendar.`);
    return icsEvents(text, {
      fromDay,
      untilDay,
      options: this.options,
      onUnsupported: (e) => console.log(`  ! repeat rule not read, first date only: ${e.summary}`),
    });
  }
}
