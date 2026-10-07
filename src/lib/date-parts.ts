/**
 * A date typed into three boxes — month, day and year — rather than picked
 * from a calendar.
 *
 * Many members have limited hand function and reach a form by voice, a mouth
 * stick, a head pointer or a switch. A calendar's day cells are small targets,
 * paging back thirty years is hundreds of presses, and the browser's own date
 * field splits into segments voice software cannot name. A labelled box that
 * takes "1996" works for every one of those ways in, so the boxes keep exactly
 * what was typed and this file decides what it means.
 *
 * Forgiving on purpose: "5", "05", "May" and "may" are all May, and a whole
 * date said or pasted into any one box is spread across the three. Nobody is
 * turned back over formatting.
 */

import { MONTHS } from '@/lib/injury';
import type { DatePrecision } from '@/types/domain';

export interface DateParts {
  month: string;
  day: string;
  year: string;
}

export const EMPTY_DATE_PARTS: DateParts = { month: '', day: '', year: '' };

export type DatePart = keyof DateParts;

const EARLIEST_YEAR = 1900;

/**
 * What three boxes say.
 *
 * `partial` is somebody still typing, so it carries what is missing but is not
 * an error. `invalid` is only ever something no amount of further typing will
 * fix — a thirteenth month, an April 31st — so it can be said at once without
 * scolding somebody halfway through a word.
 */
export type DateReading =
  | { kind: 'empty' }
  | { kind: 'partial'; need: string }
  | { kind: 'invalid'; part: DatePart; problem: string }
  | { kind: 'date'; iso: string; precision: DatePrecision };

/**
 * A month from what was typed, or null. A name needs three letters, because
 * "Ma" could still become March or May.
 */
export function monthNumber(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\.$/, '');
  if (/^\d{1,2}$/.test(t)) {
    const n = Number(t);
    return n >= 1 && n <= 12 ? n : null;
  }
  if (t.length < 3) return null;
  const index = MONTHS.findIndex((name) => name.toLowerCase().startsWith(t));
  return index === -1 ? null : index + 1;
}

/**
 * A whole date in one box — "5/27/1996", "1996-05-27", "May 27th, 1996" —
 * spread into three, or null when the text is not one. Dictation and password
 * managers both tend to put the whole thing in whichever box has focus.
 *
 * A four-digit number first is year-month-day; otherwise the month comes first,
 * the way dates are written in the US.
 */
export function splitWholeDate(text: string): DateParts | null {
  const t = text.trim();
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t);
  if (iso?.[1] && iso[2] && iso[3]) return { year: iso[1], month: iso[2], day: iso[3] };

  const us = /^(\d{1,2})[-/. ]+(\d{1,2})[-/. ]+(\d{4})$/.exec(t);
  if (us?.[1] && us[2] && us[3]) return { month: us[1], day: us[2], year: us[3] };

  const said = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i.exec(t);
  if (said?.[1] && said[2] && said[3] && monthNumber(said[1]) !== null) {
    return { month: said[1], day: said[2], year: said[3] };
  }
  return null;
}

/**
 * What one box keeps of a keystroke. Digits only for the day and year, at
 * most as many as they can hold; the month takes digits or letters, so a name
 * can be typed or said.
 */
export function cleanPart(part: DatePart, text: string): string {
  if (part === 'day') return text.replace(/\D/g, '').slice(0, 2);
  if (part === 'year') return text.replace(/\D/g, '').slice(0, 4);
  const t = text.trimStart();
  if (/^\d/.test(t)) return t.replace(/\D/g, '').slice(0, 2);
  return t.replace(/[^a-z]/gi, '').slice(0, 9);
}

/**
 * Whether a box can take no more, so the cursor can move on by itself: two
 * digits, or one that no second digit could follow — a month of 2 to 9, a day
 * of 4 to 9. "1" waits, since it may be heading for 12. A value that is wrong
 * is never full, so its problem is said where the cursor still is. A month
 * typed as a name never is either: "Sept" may be on its way to "September".
 */
export function partIsFull(part: DatePart, text: string): boolean {
  if (part === 'year') return /^\d{4}$/.test(text) && Number(text) >= EARLIEST_YEAR;
  const n = Number(text);
  if (part === 'month') return (/^\d{2}$/.test(text) && n >= 1 && n <= 12) || /^[2-9]$/.test(text);
  return (/^\d{2}$/.test(text) && n >= 1 && n <= 31) || /^[4-9]$/.test(text);
}

/**
 * The boxes for a date already on record. A date recorded to the year or the
 * month shows only that much: a member who said "2013" is never shown a
 * January 1st they did not give.
 */
export function partsFromIso(iso: string | null, precision: DatePrecision = 'day'): DateParts {
  const match = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!match?.[1] || !match[2] || !match[3]) return EMPTY_DATE_PARTS;
  return {
    year: match[1],
    month: precision === 'year' ? '' : String(Number(match[2])),
    day: precision === 'day' ? String(Number(match[3])) : '',
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Read three boxes.
 *
 * `needs: 'day'` wants all three, as a birthday does. `needs: 'year'` takes a
 * year on its own as a complete answer, with the month and day refining it, as
 * the injury date does — a day with no month is left out rather than refused,
 * since the year it sits beside is already an answer.
 *
 * Nothing after today: neither of the profile's questions has an answer in
 * the future. An event's date is the other way round, and passes `future`.
 */
export function readDate(
  parts: DateParts,
  {
    needs,
    now = new Date(),
    future = false,
  }: { needs: 'day' | 'year'; now?: Date; future?: boolean },
): DateReading {
  const month = parts.month.trim();
  const day = parts.day.trim();
  const year = parts.year.trim();
  if (!month && !day && !year) return { kind: 'empty' };

  // The definite mistakes first, whichever box they are in, so one is said
  // even while another box is still empty.
  const m = month ? monthNumber(month) : null;
  if (month && m === null) {
    const stillTyping = /^0$/.test(month) || /^[a-z]{1,2}$/i.test(month);
    if (!stillTyping) {
      return {
        kind: 'invalid',
        part: 'month',
        problem: 'The month is a number from 1 to 12, or its name.',
      };
    }
  }
  const d = /^\d{1,2}$/.test(day) ? Number(day) : null;
  if (d !== null && (d > 31 || (d === 0 && day.length === 2))) {
    return { kind: 'invalid', part: 'day', problem: 'The day is a number from 1 to 31.' };
  }
  if (/^\d{4}$/.test(year) && Number(year) < EARLIEST_YEAR) {
    return {
      kind: 'invalid',
      part: 'year',
      problem: `Check the year — it should be after ${EARLIEST_YEAR}.`,
    };
  }

  const wholeYear = /^\d{4}$/.test(year);
  const wholeMonth = m !== null;
  const wholeDay = d !== null && d >= 1;

  if (needs === 'day' && !(wholeYear && wholeMonth && wholeDay)) {
    return { kind: 'partial', need: 'Add the month, day and year — the year in four digits.' };
  }
  if (!wholeYear) return { kind: 'partial', need: 'Add the year, in four digits.' };
  if (month && !wholeMonth) return { kind: 'partial', need: 'Finish the month.' };
  if (day && wholeMonth && !wholeDay) return { kind: 'partial', need: 'Finish the day.' };

  const y = Number(year);
  let iso: string;
  let precision: DatePrecision;
  if (!wholeMonth) {
    iso = `${year}-01-01`;
    precision = 'year';
  } else if (!wholeDay) {
    iso = `${year}-${pad(m)}-01`;
    precision = 'month';
  } else {
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (d > daysInMonth) {
      return {
        kind: 'invalid',
        part: 'day',
        problem: `${MONTHS[m - 1] ?? 'That month'} ${year} has ${daysInMonth} days.`,
      };
    }
    iso = `${year}-${pad(m)}-${pad(d)}`;
    precision = 'day';
  }

  const today = now.toISOString().slice(0, 10);
  // A year or month on record is compared by its first day, so this year, or
  // this month, is not "in the future".
  if (!future && iso > today) {
    return { kind: 'invalid', part: 'year', problem: 'That date has not happened yet.' };
  }
  return { kind: 'date', iso, precision };
}
