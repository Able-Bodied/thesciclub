/**
 * Days written by hand, for sources that publish dates without hours:
 * "Nov. 5-8, 2026", "April 29-May 2, 2027*", "October 31, 2026",
 * "December 5, 2026 - December 6, 2026". And the all-day instants the events
 * table wants for them (20261021000000).
 */

import { zonedPartsToUtc } from './timezone.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '([A-Za-z]{3,9})\\.?';

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const monthOf = (word) => MONTHS.indexOf(word.slice(0, 3).toLowerCase()) + 1;

/** { first, last } as YYYY-MM-DD, or null when the text is not a date or range. */
export function parseDayRange(text) {
  const t = (text ?? '').replace(/[–—]/g, '-').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
  // "April 29-May 2, 2027" or "December 5, 2026 - December 6, 2026"
  let m = new RegExp(`^${MONTH} (\\d{1,2})(?:, (\\d{4}))? ?- ?${MONTH} (\\d{1,2}),? (\\d{4})`).exec(
    t,
  );
  if (m) {
    const [, m1, d1, y1, m2, d2, y2] = m;
    if (!monthOf(m1) || !monthOf(m2)) return null;
    return {
      first: iso(Number(y1 ?? y2), monthOf(m1), Number(d1)),
      last: iso(Number(y2), monthOf(m2), Number(d2)),
    };
  }
  // "Nov. 5-8, 2026" or "October 31, 2026"
  m = new RegExp(`^${MONTH} (\\d{1,2})(?: ?- ?(\\d{1,2}))?,? (\\d{4})`).exec(t);
  if (m) {
    const [, word, d1, d2, y] = m;
    const month = monthOf(word);
    if (!month) return null;
    return {
      first: iso(Number(y), month, Number(d1)),
      last: iso(Number(y), month, Number(d2 ?? d1)),
    };
  }
  return null;
}

/** First day's midnight to the last day's 23:59, in `zone`. */
export function allDayInstants({ first, last }, zone) {
  const at = (day, hour, minute) => {
    const [year, month, d] = day.split('-').map(Number);
    return zonedPartsToUtc({ year, month, day: d, hour, minute, second: 0 }, zone).toISOString();
  };
  return { start_time: at(first, 0, 0), end_time: at(last, 23, 59) };
}
