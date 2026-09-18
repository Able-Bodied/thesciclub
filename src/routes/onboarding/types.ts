import { isAdult } from '@/lib/injury';
import { isCompletePhone } from '@/lib/phone';
import type { Completeness, DatePrecision, ExactLevel, LevelRange } from '@/types/domain';

/**
 * The shape onboarding collects, and the order it collects it in.
 *
 * Ordered so the cost of each question rises as the person's investment does.
 * The number comes first because it is the account; the photo is last because
 * it is the only optional one and the flow should be finishable without it.
 */

export interface OnboardingData {
  phone: string;
  code: string;
  displayName: string;
  birthDate: string;
  exactLevel: ExactLevel | null;
  completeness: Completeness;
  /** Stored as a date; asked as a year, refined only if somebody wants to. */
  injuryYear: string;
  injuryMonth: string;
  injuryDay: string;
  city: string;
  state: string;
  /** Only used to look up a city and state. Never stored. */
  zip: string;
  photoFile: File | null;
  photoPreviewUrl: string | null;
  /**
   * Things the person said they would rather not give, keyed the way
   * `DECLINABLE_DETAILS` keys them — see 20260917030000.
   *
   * Collected here rather than written as it happens because the member row
   * does not exist yet: onboarding assembles the whole thing and inserts it
   * once, so a decline is another answer to carry to the insert.
   */
  declined: string[];
}

export const INITIAL_ONBOARDING_DATA: OnboardingData = {
  phone: '',
  code: '',
  displayName: '',
  birthDate: '',
  exactLevel: null,
  completeness: 'Do not know',
  injuryYear: '',
  injuryMonth: '',
  injuryDay: '',
  city: '',
  state: '',
  zip: '',
  photoFile: null,
  photoPreviewUrl: null,
  declined: [],
};

/**
 * `claim` appears only when the invite points at a seeded profile, and `blocked`
 * only when the verified number turns out not to be on the list. Neither is a
 * step somebody walks through in order, so neither is counted in the progress
 * bar.
 */
export const STEPS = [
  'welcome',
  'phone',
  'code',
  'claim',
  'name',
  'birthday',
  'injury',
  'city',
  'photo',
] as const;
export type Step = (typeof STEPS)[number];

/** The five that carry a "step N of 5" label. */
export const COUNTED_STEPS: Step[] = ['name', 'birthday', 'injury', 'city', 'photo'];

export function stepNumber(step: Step): number | null {
  const index = COUNTED_STEPS.indexOf(step);
  return index === -1 ? null : index + 1;
}

/**
 * The injury date, assembled from what was actually given, with the precision
 * that reflects it. A year alone is a complete answer.
 */
export function injuryDateOf(
  data: OnboardingData,
): { date: string; precision: DatePrecision } | null {
  const year = data.injuryYear.trim();
  if (!/^\d{4}$/.test(year)) return null;

  const month = data.injuryMonth.trim();
  if (!month) return { date: `${year}-01-01`, precision: 'year' };

  const mm = month.padStart(2, '0');
  const day = data.injuryDay.trim();
  if (!day) return { date: `${year}-${mm}-01`, precision: 'month' };

  return { date: `${year}-${mm}-${day.padStart(2, '0')}`, precision: 'day' };
}

/** Whether the current step has enough to move on. */
export function canAdvance(step: Step, data: OnboardingData): boolean {
  switch (step) {
    case 'phone':
      return isCompletePhone(data.phone);
    case 'code':
      return data.code.replace(/\D/g, '').length === 6;
    case 'name':
      return data.displayName.trim().length > 0;
    case 'birthday':
      // Not just a well-formed date: the club is 18+, and the database
      // refuses anybody younger, so the form must not let them get that far.
      return isAdult(data.birthDate);
    case 'injury':
      // Declining is an answer here exactly as it is in the survey, so the
      // step is satisfied by either. Without this the only way past a question
      // somebody does not want to answer was "Finish later", which abandons
      // the rest of the wizard — a much bigger thing than declining one page.
      return (
        (data.exactLevel !== null || data.declined.includes('exactLevel')) &&
        (injuryDateOf(data) !== null || data.declined.includes('injuryDate'))
      );
    case 'city':
      // A state is the coarsest thing we always want. City can be blank —
      // "somewhere else" is a real answer.
      return data.state.trim().length > 0;
    default:
      return true;
  }
}

/**
 * The seeded profile an invite entitles its holder to claim, as much of it as
 * the claim card needs and no more.
 *
 * Not a `BrowseMember`. The person reading this card is not a member yet, and
 * on a mistyped invite is not the person on the card either — so it carries a
 * photograph, a name, a level and a city, and not the bio, which on these
 * rows describes catheters and bowel programmes. `my_claimable_profile()`
 * returns exactly these columns.
 */
export interface ClaimableProfile {
  id: string;
  displayName: string;
  photoPath: string | null;
  photoAlt: string | null;
  city: string | null;
  state: string;
  levelRange: LevelRange;
  exactLevel: ExactLevel | null;
  completeness: Completeness;
  affiliations: string[];
}

/**
 * What the injury step asks that can be declined.
 *
 * Not `completeness`: 'Do not know' is already on that list as a real answer,
 * and the same reasoning that keeps it out of `missingDetails` keeps it out of
 * here — an honest answer is not a gap, and offering to decline it twice would
 * be offering the same thing under two names.
 */
export const INJURY_STEP_DECLINABLE = ['exactLevel', 'injuryDate'] as const;

/** Whether the injury step has already been declined, in whole. */
export function injuryStepDeclined(data: OnboardingData): boolean {
  return INJURY_STEP_DECLINABLE.every((key) => data.declined.includes(key));
}

/**
 * Toggle the injury step's decline.
 *
 * Pressed again it takes the decline back, the same way the survey's does:
 * somebody who changes their mind should not have to guess that the only way
 * out is to answer.
 */
export function withInjuryDeclined(data: OnboardingData, declined: boolean): string[] {
  const keys: string[] = [...INJURY_STEP_DECLINABLE];
  if (!declined) return data.declined.filter((k) => !keys.includes(k));
  return [...data.declined.filter((k) => !keys.includes(k)), ...keys];
}
