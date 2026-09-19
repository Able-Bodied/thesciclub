/**
 * When a post or a message arrived, in the shortest true form.
 *
 * One formatter for the whole feature — topic rows, posts and bubbles all call
 * this — because the alternative is three that drift, and a list where the same
 * moment reads three ways is a list nobody trusts.
 *
 * ---------------------------------------------------------------------------
 * The viewer's zone, not the writer's
 * ---------------------------------------------------------------------------
 * The opposite of `routes/events/format.ts`, and deliberately. An event happens
 * at a place and its timezone is a fact about it, so the listing shows the
 * event's zone. A message happened *to you*: "09:30" means the clock on the
 * wall when it landed, and a member in California reading a post written in
 * London wants their own morning, not somebody else's afternoon.
 *
 * So `timeZone` defaults to the runtime's. The parameter exists so the tests can
 * fix one — a test that reads the machine's zone passes on a laptop and fails in
 * CI, which is the kind of test this project has been bitten by.
 *
 * ---------------------------------------------------------------------------
 * The shape, and why it is not the plan's
 * ---------------------------------------------------------------------------
 * CHAT-PLAN.md wrote the clock as "09:30". It is "9:30am" here, which is what
 * `timeOfDay` in events/format.ts already produces and therefore what every
 * time in this app already looks like. Two clock formats in one product is a
 * worse outcome than either of them.
 *
 * Today is a clock, the last six days are a weekday, anything older is a date,
 * and a date in another year carries the year. Each step is the least that is
 * still unambiguous, which is the point: a column of times is read by scanning,
 * and "Mon" scans where "15 Sep 2026, 09:30" does not.
 */

function partsIn(date: Date, timeZone: string | undefined, options: Intl.DateTimeFormatOptions) {
  // en-US for the same reason events/format.ts gives: the surrounding prose is
  // English and these strings sit in fixed columns.
  const formatter = new Intl.DateTimeFormat('en-US', { ...options, timeZone });
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

/** The calendar day in the given zone, as a sortable `2026-09-18`. */
function dayIn(date: Date, timeZone: string | undefined): string {
  const parts = partsIn(date, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * "9:30am" · "Mon" · "12 Sep" · "12 Sep 2024".
 *
 * `now` is a parameter rather than read inside, so the whole thing is pure and
 * every case is testable without waiting for Tuesday.
 */
export function chatTime(iso: string, now: Date = new Date(), timeZone?: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';

  const today = dayIn(now, timeZone);
  const day = dayIn(at, timeZone);

  if (day === today) {
    const parts = partsIn(at, timeZone, { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${parts.hour}:${parts.minute}${(parts.dayPeriod ?? '').toLowerCase()}`;
  }

  // Whole days between the two calendar dates, counted on the dates themselves
  // rather than on the instants: 23 hours ago can be either yesterday or this
  // morning, and only the calendar knows which.
  const elapsed = Math.round((Date.parse(today) - Date.parse(day)) / 86_400_000);
  if (elapsed >= 1 && elapsed <= 6) {
    return partsIn(at, timeZone, { weekday: 'short' }).weekday ?? '';
  }

  const sameYear =
    partsIn(at, timeZone, { year: 'numeric' }).year ===
    partsIn(now, timeZone, { year: 'numeric' }).year;
  const parts = partsIn(at, timeZone, { day: 'numeric', month: 'short', year: 'numeric' });
  return sameYear ? `${parts.day} ${parts.month}` : `${parts.day} ${parts.month} ${parts.year}`;
}

/**
 * The same moment written out: "18 September 2026 at 9:30am".
 *
 * For the one place a topic says when it started, where the short form would be
 * a bare weekday under a heading and answer nothing.
 */
export function chatTimeLong(iso: string, timeZone?: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const parts = partsIn(at, timeZone, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const clock = `${parts.hour}:${parts.minute}${(parts.dayPeriod ?? '').toLowerCase()}`;
  return `${parts.day} ${parts.month} ${parts.year} at ${clock}`;
}
