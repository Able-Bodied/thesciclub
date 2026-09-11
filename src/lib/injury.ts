/**
 * Reading an injury date.
 *
 * `injury_date` is a date, not a stored number of years, so time-since-injury is
 * computed on every read and cannot go stale. It is nullable — the NorCal SCI
 * directory does not record it, and "I would rather not say" is a real answer —
 * so every function here has to mean something when it is absent.
 *
 * `injury_date_precision` exists so nothing renders more confidence than was
 * given. Somebody who said "2013" is shown "2013", never a fabricated day.
 */

import type { DatePrecision } from '@/types/domain';

export interface InjuryDated {
  injuryDate: string | null;
  injuryDatePrecision: DatePrecision | null;
}

/**
 * Whole calendar months since the injury, or null when no date was given.
 *
 * Calendar arithmetic rather than dividing elapsed milliseconds by an average
 * year: an exact anniversary is 365 days, an average year is 365.2425, so the
 * division puts somebody at 0.9993 years on the day itself and the label reads
 * "12 months post-injury" instead of "1 year". Counting months makes the
 * anniversary land exactly.
 */
export function monthsSinceInjury(member: InjuryDated, now: Date = new Date()): number | null {
  if (!member.injuryDate) return null;
  const then = new Date(`${member.injuryDate}T00:00:00Z`);
  if (Number.isNaN(then.getTime())) return null;

  let months =
    (now.getUTCFullYear() - then.getUTCFullYear()) * 12 + (now.getUTCMonth() - then.getUTCMonth());
  if (now.getUTCDate() < then.getUTCDate()) months -= 1;
  return months < 0 ? 0 : months;
}

/** Years since injury, fractional. Used for ranking, where the shape matters more
 *  than the exact figure. Null when no date was given. */
export function yearsSinceInjury(member: InjuryDated, now?: Date): number | null {
  const months = monthsSinceInjury(member, now);
  return months === null ? null : months / 12;
}

/**
 * Under a year in. Null when unknown — deliberately not `false`, because
 * "we do not know" and "no" lead to different decisions: the first should not
 * quietly route somebody away from the mentors they might need.
 */
export function isNewlyInjured(member: InjuryDated, now?: Date): boolean | null {
  const months = monthsSinceInjury(member, now);
  return months === null ? null : months < 12;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** The injury date at exactly the precision it was given, never more. */
export function injuryDateLabel(member: InjuryDated): string | null {
  if (!member.injuryDate || !member.injuryDatePrecision) return null;
  const [y, m, d] = member.injuryDate.split('-');
  if (!y) return null;
  if (member.injuryDatePrecision === 'year') return y;
  const monthName = MONTHS[Number(m) - 1];
  if (!monthName) return y;
  if (member.injuryDatePrecision === 'month') return `${monthName} ${y}`;
  return `${monthName} ${Number(d)}, ${y}`;
}

/** "3 years post-injury", or null when there is no date to say it from. */
export function timeSinceLabel(member: InjuryDated, now?: Date): string | null {
  const months = monthsSinceInjury(member, now);
  if (months === null) return null;
  if (months < 12) {
    const m = Math.max(1, months);
    return `${m} month${m === 1 ? '' : 's'} post-injury`;
  }
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} post-injury`;
}

/** Age on a given date, from a birth date. Age is never stored. */
export function ageFrom(birthDate: string | null, now: Date = new Date()): number | null {
  if (!birthDate) return null;
  const born = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return null;
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < born.getUTCMonth() ||
    (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** The club is 18+. One place decides what that means. */
export const MINIMUM_AGE = 18;

export function isAdult(birthDate: string | null, now?: Date): boolean {
  const age = ageFrom(birthDate, now);
  return age !== null && age >= MINIMUM_AGE;
}

/**
 * The latest birth date that is old enough, as an ISO date — for the `max` on
 * a date input. Computed rather than hard-coded, because a year written into
 * the markup is correct for about twelve months.
 */
export function latestAdultBirthDate(now: Date = new Date()): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear() - MINIMUM_AGE, now.getUTCMonth(), now.getUTCDate()),
  );
  return d.toISOString().slice(0, 10);
}
