import type { ClubEvent } from '@/types/domain';

/**
 * Turning a date-ordered list of events into one row per repeating event.
 *
 * ---------------------------------------------------------------------------
 * Why this is worth doing at all
 * ---------------------------------------------------------------------------
 * The calendar is made of far fewer events than it has rows. Measured against
 * the live feed: 115 upcoming rows are 34 distinct events, and three of them
 * are most of the difference — Staying Driven repeats 27 times, the Friday
 * Happy Hour and Weekly Wednesdays 15 each. A member scanning the default
 * thirty-day window meets the same wheelchair fitness class nine times before
 * reaching anything else.
 *
 * Listing every occurrence is still correct for a calendar — you want to know
 * when *this* Friday's happy hour is — so the problem is scanning rather than
 * correctness, and the answer is to show the next one and say how many more
 * there are, not to hide the rest.
 *
 * ---------------------------------------------------------------------------
 * Counted within the window, never across the whole series
 * ---------------------------------------------------------------------------
 * The events handed in are already filtered — by segment, by date window, by
 * every chip in the sheet. The count and the last date come from those and
 * nothing else, so "8 more dates" always means eight rows that expanding will
 * actually show. Reading the whole series instead would put 27 on a card whose
 * expansion offers nine, under a window the member chose.
 */
export interface SeriesGroup {
  /** The occurrence that stands for the group: the first one in the list. */
  lead: ClubEvent;
  /** Every later occurrence inside the current filters, in the same order. */
  rest: ClubEvent[];
  /**
   * The series this group belongs to, or null for a one-off.
   *
   * A group with a null key always has an empty `rest`: two unrelated events
   * are not a series, and grouping them because neither has one would collapse
   * the whole one-off half of the calendar into a single row.
   */
  seriesId: string | null;
}

/**
 * Group a date-ordered list without reordering it.
 *
 * Each series appears once, at the position of its earliest occurrence, so the
 * list stays in date order by the thing a member is reading it for — the next
 * time each event happens. Occurrences of one series are not adjacent in the
 * input and are not expected to be.
 */
export function groupBySeries(events: ClubEvent[]): SeriesGroup[] {
  const groups: SeriesGroup[] = [];
  const bySeries = new Map<string, SeriesGroup>();

  for (const event of events) {
    if (!event.seriesId) {
      groups.push({ lead: event, rest: [], seriesId: null });
      continue;
    }
    const existing = bySeries.get(event.seriesId);
    if (existing) {
      existing.rest.push(event);
      continue;
    }
    const group: SeriesGroup = { lead: event, rest: [], seriesId: event.seriesId };
    bySeries.set(event.seriesId, group);
    groups.push(group);
  }

  return groups;
}

/**
 * How often a group repeats, in the member's words, or null when it does not
 * repeat often enough to be worth naming.
 *
 * Derived here and never stored. A cadence is a property of the occurrences
 * that happen to be in front of somebody — inside a seven-day window a weekly
 * series has one gap and a monthly one has none — so a stored answer would
 * disagree with the list it sits in.
 *
 * The median gap, not the mean: holidays move a date and a skipped week
 * doubles one gap, which drags a mean into the next bucket and renames a
 * weekly class "fortnightly". One displaced occurrence should not rename
 * anything.
 *
 * Anything that does not land near a familiar rhythm gets no name rather than
 * a wrong one — "Repeats" is the honest answer for a group that meets twice a
 * year, and `null` lets the caller say only how many dates there are.
 */
export function cadenceOf(group: SeriesGroup): string | null {
  const all = [group.lead, ...group.rest];
  if (all.length < 2) return null;

  const days: number[] = [];
  for (let i = 1; i < all.length; i += 1) {
    const previous = Date.parse(all[i - 1]?.startTime ?? '');
    const current = Date.parse(all[i]?.startTime ?? '');
    if (Number.isNaN(previous) || Number.isNaN(current)) continue;
    days.push(Math.abs(current - previous) / 86_400_000);
  }
  if (days.length === 0) return null;

  days.sort((a, b) => a - b);
  const middle = Math.floor(days.length / 2);
  const median =
    days.length % 2 === 0
      ? ((days[middle - 1] ?? 0) + (days[middle] ?? 0)) / 2
      : (days[middle] ?? 0);

  // Generous bands, because a feed's times drift by an hour over a daylight
  // saving boundary and a holiday moves a date by a day or two.
  if (median >= 0.5 && median <= 2.5) return 'Daily';
  if (median >= 5.5 && median <= 8.5) return 'Weekly';
  if (median >= 12 && median <= 16) return 'Fortnightly';
  if (median >= 26 && median <= 35) return 'Monthly';
  return 'Repeats';
}
