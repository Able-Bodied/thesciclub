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

import type { DatePrecision, InjuryStage } from '@/types/domain';

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

/**
 * How long ago, from the date where there is one (the reader's own, or one its
 * member shows), and otherwise the stage the database sent in its place.
 * The same edges as public.injury_stage (20261117030000).
 */
export function injuryStageOf(
  member: InjuryDated & { injuryStage?: InjuryStage | null },
  now?: Date,
): InjuryStage | null {
  const months = monthsSinceInjury(member, now);
  if (months === null) return member.injuryStage ?? null;
  if (months < 6) return 'new';
  if (months < 24) return 'recent';
  if (months < 120) return 'years';
  if (months < 480) return 'og';
  return 'oog';
}

/** The owner's words, 2026-11-17. */
export const INJURY_STAGE_TEXT: Record<InjuryStage, string> = {
  new: 'Newly injured',
  recent: 'Recently injured',
  years: 'Injured 2–10 years ago',
  og: 'OG · 10+ years',
  oog: 'OOG · 40+ years',
};

/** A year inside each stage, for ordering and matching where the date is hidden. */
const STAGE_YEARS: Record<InjuryStage, number> = {
  new: 0.25,
  recent: 1.25,
  years: 6,
  og: 25,
  oog: 45,
};

/**
 * Years since injury from the date, or from the stage where the date is
 * hidden. For ordering and matching only; never shown as a number.
 */
export function roughYearsSinceInjury(
  member: InjuryDated & { injuryStage?: InjuryStage | null },
  now?: Date,
): number | null {
  const years = yearsSinceInjury(member, now);
  if (years !== null) return years;
  return member.injuryStage ? STAGE_YEARS[member.injuryStage] : null;
}

export const MONTHS = [
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

/** A date in words at exactly the precision it was given, never more. */
export function dateLabel(iso: string, precision: DatePrecision): string | null {
  const [y, m, d] = iso.split('-');
  if (!y) return null;
  if (precision === 'year') return y;
  const monthName = MONTHS[Number(m) - 1];
  if (!monthName) return y;
  if (precision === 'month') return `${monthName} ${y}`;
  return `${monthName} ${Number(d)}, ${y}`;
}

/** The injury date at exactly the precision it was given, never more. */
export function injuryDateLabel(member: InjuryDated): string | null {
  if (!member.injuryDate || !member.injuryDatePrecision) return null;
  return dateLabel(member.injuryDate, member.injuryDatePrecision);
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
