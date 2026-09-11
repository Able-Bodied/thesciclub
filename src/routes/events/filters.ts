/**
 * Which events are in the list.
 *
 * Pure functions over plain data, the same shape as src/routes/peers/filters.ts,
 * so the rules can be tested without a database or a component.
 *
 * ---------------------------------------------------------------------------
 * Why this filters in the client where ab-peers filtered in the query
 * ---------------------------------------------------------------------------
 * ab-peers pushed every filter into the Supabase query because its feed paged:
 * filtering after the fact would have meant fetching a page of fifty, dropping
 * forty-six, and showing four. There is no paging here. The corpus is two
 * California calendars — a few hundred rows, of which the default window shows
 * a month — so the list fetches the window once and narrows it in memory, which
 * makes every chip instant and every rule testable as a function.
 *
 * That trade has a limit and it is worth naming: it stops being right when the
 * club adds enough feeds that a month does not fit in one fetch. The fix then
 * is paging plus query-side filters, and `dateWindowRange` is already the piece
 * the query would need.
 */

import type {
  ClubEvent,
  DateWindow,
  EventFilters,
  EventFormat,
  EventsSegment,
  EventTag,
} from '@/types/domain';

/** What the viewer has already said about these events. */
export interface ViewerEventState {
  /** Event id -> the viewer's own RSVP. Absent means they have not said. */
  rsvps: Map<string, 'interested' | 'going'>;
}

export const NO_VIEWER_STATE: ViewerEventState = { rsvps: new Map() };

export interface DateRange {
  /** Inclusive lower bound, ISO. Absent for `past`, which has no lower bound. */
  from?: string;
  /** Inclusive upper bound, ISO. Absent for `any`, which has no upper bound. */
  to?: string;
}

/**
 * The range a window selects, or null for "no bound at all".
 *
 * The forward windows start at midnight *today* rather than at `now`, so an
 * event that started an hour ago is still in the list — somebody checking at
 * 2pm has not missed a thing that began at 1pm, and dropping it makes the list
 * appear to lose events as the day goes on. They end at the last instant of the
 * final day so an 8pm event on the boundary is inside.
 *
 * Both are rolling counts of days, so the window a member sees is the same size
 * whenever they open the app. An earlier version ran the longer one to the end
 * of the calendar month instead, which meant the default view held twenty days
 * of events on the 11th and one day on the 30th.
 *
 * `past` is the mirror image and ends the instant before today begins, so the
 * two never overlap and no event is in both.
 *
 * Local midnight, not UTC midnight: the boundary somebody means by "this week"
 * is the one where their own day rolls over.
 */
export function dateWindowRange(when: DateWindow, now: Date = new Date()): DateRange | null {
  if (when === 'any') return null;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  if (when === 'past') {
    return { to: new Date(startOfToday.getTime() - 1).toISOString() };
  }

  // Inclusive of today, so `next7` is today plus the six that follow.
  const days = when === 'next7' ? 6 : 29;
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 23, 59, 59, 999);

  return { from: startOfToday.toISOString(), to: to.toISOString() };
}

/** Past events read newest first (nearest to today); every other window reads soonest first. */
export function ascendingByDate(when: DateWindow): boolean {
  return when !== 'past';
}

function inDateWindow(event: ClubEvent, when: DateWindow, now: Date): boolean {
  const range = dateWindowRange(when, now);
  if (!range) return true;
  if (range.from && event.startTime < range.from) return false;
  if (range.to && event.startTime > range.to) return false;
  return true;
}

/**
 * Whether an event counts as attendable without travelling.
 *
 * Hybrid counts. Somebody reaching for "Online" is asking "can I be at this
 * without getting there", and a hybrid event answers yes — excluding it would
 * hide the exact events that exist to be reachable both ways.
 */
export function isOnline(event: ClubEvent): boolean {
  return event.format === 'online' || event.format === 'hybrid';
}

/** Whether an event is tagged anywhere under Sport & recreation. */
export function isSport(event: ClubEvent): boolean {
  return event.tags.some((tag) => tag.categorySlug === 'sport');
}

function matchesSegment(event: ClubEvent, segment: EventsSegment, viewer: ViewerEventState) {
  switch (segment) {
    case 'going':
      return viewer.rsvps.get(event.id) === 'going';
    case 'sport':
      return isSport(event);
    case 'online':
      return isOnline(event);
    // `orgs` is not a list of events at all — it swaps the body for the
    // organization directory — so it never reaches here. `upcoming` is the
    // unnarrowed list, which the date window alone decides.
    default:
      return true;
  }
}

/**
 * Every narrowing rule, in one pass.
 *
 * An empty list in any of `formats`, `tags`, `cities` or `organizations` means
 * "do not narrow by this", never "match nothing". Treating an empty selection
 * as excluding everything would hand somebody a blank list for the very natural
 * act of unticking the last box, with no hint that unticking one more would
 * bring it all back.
 */
export function filterEvents(
  events: ClubEvent[],
  filters: EventFilters,
  segment: EventsSegment,
  viewer: ViewerEventState = NO_VIEWER_STATE,
  now: Date = new Date(),
): ClubEvent[] {
  const kept = events.filter((event) => {
    // The "I'm going" segment deliberately ignores the date window. Somebody
    // checking what they have committed to means all of it, and a list that
    // silently dropped next month's trip because the window says "this week"
    // would be answering a question they did not ask.
    if (segment !== 'going' && !inDateWindow(event, filters.when, now)) return false;
    if (!matchesSegment(event, segment, viewer)) return false;

    if (filters.formats.length > 0) {
      if (!event.format || !filters.formats.includes(event.format)) return false;
    }
    if (filters.cities.length > 0) {
      if (!event.city || !filters.cities.includes(event.city)) return false;
    }
    if (filters.organizations.length > 0) {
      if (!event.organizationId || !filters.organizations.includes(event.organizationId)) {
        return false;
      }
    }
    if (filters.tags.length > 0) {
      if (!event.tags.some((tag) => filters.tags.includes(tag.slug))) return false;
    }
    return true;
  });

  const ascending = segment === 'going' ? true : ascendingByDate(filters.when);
  return kept.sort((a, b) =>
    ascending ? a.startTime.localeCompare(b.startTime) : b.startTime.localeCompare(a.startTime),
  );
}

/** How many narrowing choices are on, for the dot on the filter button. */
export function activeFilterCount(filters: EventFilters): number {
  return (
    filters.formats.length +
    filters.tags.length +
    filters.cities.length +
    filters.organizations.length +
    // The window is a filter too, but only when it is not the default.
    (filters.when === 'next30' ? 0 : 1)
  );
}

/** Toggle a value in one of the list-shaped filters. */
export function toggleFilter<K extends 'formats' | 'tags' | 'cities' | 'organizations'>(
  filters: EventFilters,
  key: K,
  value: EventFilters[K][number],
): EventFilters {
  const current = filters[key] as string[];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  return { ...filters, [key]: next };
}

/**
 * The cities present in a set of events, most common first.
 *
 * Frequency order rather than alphabetical, because the point of the list is to
 * narrow a feed: a city with one event in it is not what somebody is looking
 * for, and eleven of those above "San Jose" is a list nobody scrolls.
 */
export function citiesIn(events: ClubEvent[]): string[] {
  return byFrequency(events.flatMap((event) => (event.city ? [event.city] : [])));
}

/** The formats actually present, so the sheet never offers a chip that matches nothing. */
export function formatsIn(events: ClubEvent[]): EventFormat[] {
  const seen = new Set(events.flatMap((event) => (event.format ? [event.format] : [])));
  return (['in_person', 'online', 'hybrid'] as const).filter((format) => seen.has(format));
}

function byFrequency(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value]) => value);
}

/**
 * The distinct tags present on a set of events, category order preserved.
 *
 * Drawn from the events rather than from the taxonomy table so the sheet never
 * offers a chip that matches nothing — see the sheet's own header. Within a
 * category the order is first-seen, which is the taxonomy's `display_order`
 * because the list arrives sorted by it.
 */
export function tagsIn(events: ClubEvent[]): EventTag[] {
  const seen = new Map<string, EventTag>();
  for (const event of events) {
    for (const tag of event.tags) {
      if (!seen.has(tag.slug)) seen.set(tag.slug, tag);
    }
  }
  return [...seen.values()].sort(
    (a, b) => a.categoryName.localeCompare(b.categoryName) || a.name.localeCompare(b.name),
  );
}

/** The organization ids hosting any of these events, for the "Hosted by" group. */
export function organizationIdsIn(events: ClubEvent[]): Set<string> {
  return new Set(events.flatMap((event) => (event.organizationId ? [event.organizationId] : [])));
}
