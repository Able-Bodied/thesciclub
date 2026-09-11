/**
 * Turning an event's timestamps into the strings the mock shows.
 *
 * Pure, and separate from the components, because this is where the bugs are:
 * every function here is a timezone question wearing a formatting costume. See
 * `ClubEvent.timezone` for why the event's zone wins over the viewer's.
 *
 * `Intl.DateTimeFormat` does the conversion rather than date arithmetic on a
 * `Date`. A Date is an instant, not a wall clock, so `getHours()` answers in
 * whatever zone the machine happens to be in — which is the viewer's zone on a
 * phone and UTC in CI, and that difference is exactly the kind of test that
 * passes everywhere except in front of somebody.
 */

/** The parts of the mock's date tile: `evParts()` in docs/index.html. */
export interface DateTileParts {
  /** Three letters, upper case: SAT. */
  dow: string;
  /** No leading zero: 5, not 05. */
  day: string;
  /** Three letters, upper case: SEP. */
  mon: string;
}

function partsIn(iso: string, timezone: string, options: Intl.DateTimeFormatOptions) {
  // en-US rather than the viewer's locale: the mock's tile is three English
  // letters in a fixed-width box, and a locale whose day abbreviation is longer
  // (or whose numerals are not Latin) would overflow it. The prose around the
  // tile is English too.
  const formatter = new Intl.DateTimeFormat('en-US', { ...options, timeZone: timezone });
  return Object.fromEntries(
    formatter.formatToParts(new Date(iso)).map((part) => [part.type, part.value]),
  );
}

export function dateTileParts(iso: string, timezone: string): DateTileParts {
  const parts = partsIn(iso, timezone, { weekday: 'short', day: 'numeric', month: 'short' });
  return {
    dow: (parts.weekday ?? '').toUpperCase(),
    day: parts.day ?? '',
    mon: (parts.month ?? '').toUpperCase(),
  };
}

/**
 * "10:00am", matching the mock. Lower case and unspaced, which is the mock's
 * own style and not what en-US produces ("10:00 AM").
 *
 * A time exactly on the hour keeps its ":00" rather than collapsing to "10am" —
 * the tile and the detail hero line up in a column, and a ragged one reads as
 * a mistake.
 */
export function timeOfDay(iso: string, timezone: string): string {
  const parts = partsIn(iso, timezone, { hour: 'numeric', minute: '2-digit', hour12: true });
  const period = (parts.dayPeriod ?? '').toLowerCase();
  return `${parts.hour ?? ''}:${parts.minute ?? ''}${period}`;
}

/**
 * The time range, or just the start when there is no end.
 *
 * An end time on a different day is shown with its date ("10:00am – 2 Sep,
 * 1:00pm"), because "10:00am – 1:00pm" for an overnight trip is wrong by a day
 * and looks right, which is the worst combination.
 */
export function timeRange(startIso: string, endIso: string | null, timezone: string): string {
  const start = timeOfDay(startIso, timezone);
  if (!endIso) return start;

  const sameDay =
    partsIn(startIso, timezone, { year: 'numeric', month: 'short', day: 'numeric' }).day ===
      partsIn(endIso, timezone, { year: 'numeric', month: 'short', day: 'numeric' }).day &&
    partsIn(startIso, timezone, { month: 'short' }).month ===
      partsIn(endIso, timezone, { month: 'short' }).month;

  if (sameDay) return `${start} – ${timeOfDay(endIso, timezone)}`;

  const end = partsIn(endIso, timezone, { day: 'numeric', month: 'short' });
  return `${start} – ${end.day} ${end.month}, ${timeOfDay(endIso, timezone)}`;
}

/** "Sat 5 Sep · 10:00am" — the mock's `e.when`, used in the detail hero. */
export function longWhen(iso: string, timezone: string): string {
  const parts = partsIn(iso, timezone, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${parts.weekday} ${parts.day} ${parts.month} · ${timeOfDay(iso, timezone)}`;
}
