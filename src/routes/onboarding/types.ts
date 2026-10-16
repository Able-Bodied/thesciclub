import { readDate } from '@/lib/date-parts';
import { isAdult } from '@/lib/injury';
import { isCompletePhone } from '@/lib/phone';
import { isValidUsername } from '@/lib/usernames';
import type { Completeness, DatePrecision, ExactLevel, InjuryType } from '@/types/domain';

/**
 * The shape onboarding collects, and the order it collects it in.
 *
 * Ordered so the cost of each question rises as the person's investment does.
 * The way in comes first because it is the account; the photo is last because
 * it is the only optional one and the flow should be finishable without it.
 */

export interface OnboardingData {
  /** The sign-in and join forms. Never stored in the member row. */
  email: string;
  password: string;
  /** The join form's second password field. Never goes anywhere. */
  passwordAgain: string;
  displayName: string;
  /** The @name, lowercase and without the "@". */
  username: string;
  /**
   * The username `username_available` last said yes to. The step goes on only
   * when it equals `username`, so a name edited after the check, or a check
   * still on its way, never counts.
   */
  usernameChecked: string;
  /**
   * An optional contact number "for events", typed by the member and never
   * verified. Event hosts get it when the member chooses Going.
   */
  phone: string;
  /**
   * The ISO date, or '' until the three boxes below make a real one. Kept
   * beside them so everything past the birthday step reads one value.
   */
  birthDate: string;
  /** Exactly what was typed — see `lib/date-parts.ts`. */
  birthMonth: string;
  birthDay: string;
  birthYear: string;
  /** Para, quad, central cord or another condition: asked first (spinal-cord-fields.tsx). */
  injuryType: InjuryType | null;
  exactLevel: ExactLevel | null;
  /** Only for a condition: typed, so '' while blank. */
  conditionName: string;
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
  /** Terms of Service and Privacy Policy, asked once the invite check has passed. */
  termsAgreed: boolean;
}

export const INITIAL_ONBOARDING_DATA: OnboardingData = {
  email: '',
  password: '',
  passwordAgain: '',
  displayName: '',
  username: '',
  usernameChecked: '',
  phone: '',
  birthDate: '',
  birthMonth: '',
  birthDay: '',
  birthYear: '',
  injuryType: null,
  exactLevel: null,
  conditionName: '',
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
  termsAgreed: false,
};

/**
 * The first six are the doors and the waiting rooms, and `agree` follows the
 * invite check for somebody who is joining: none is a step somebody walks
 * through in order, so none is counted in the progress bar.
 */
export const STEPS = [
  'welcome',
  'signin',
  'forgot',
  'join',
  'check-email',
  'checking',
  'agree',
  'name',
  'username',
  'birthday',
  'injury',
  'city',
  'phone',
  'photo',
] as const;
export type Step = (typeof STEPS)[number];

/** The seven that carry a "step N of 7" label. */
export const COUNTED_STEPS: Step[] = [
  'name',
  'username',
  'birthday',
  'injury',
  'city',
  'phone',
  'photo',
];

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
  const reading = readDate(injuryPartsOf(data), { needs: 'year' });
  return reading.kind === 'date' ? { date: reading.iso, precision: reading.precision } : null;
}

export function injuryPartsOf(data: OnboardingData) {
  return { year: data.injuryYear, month: data.injuryMonth, day: data.injuryDay };
}

export function birthPartsOf(data: OnboardingData) {
  return { year: data.birthYear, month: data.birthMonth, day: data.birthDay };
}

/** Whether the current step has enough to move on. */
export function canAdvance(step: Step, data: OnboardingData): boolean {
  switch (step) {
    case 'agree':
      return data.termsAgreed;
    case 'name':
      return data.displayName.trim().length > 0;
    case 'username':
      return isValidUsername(data.username) && data.usernameChecked === data.username;
    case 'phone':
      // Optional: empty is an answer. A number half typed is not.
      return data.phone.trim() === '' || isCompletePhone(data.phone);
    case 'birthday':
      // Not just a well-formed date: the club is 18+, and the database
      // refuses anybody younger, so the form must not let them get that far.
      return isAdult(data.birthDate);
    case 'injury':
      // Declining is an answer here exactly as it is in the survey, so the
      // step is satisfied by either. Without this the only way past a question
      // somebody does not want to answer was "Finish later", which abandons
      // the rest of the wizard — a much bigger thing than declining one page.
      // The date is optional (the owner, 2026-10-15): empty goes on, a
      // whole one goes on, and only one half typed holds the step.
      return (
        (spinalCordAnswered(data) || data.declined.includes('exactLevel')) &&
        (injuryDateOf(data) !== null ||
          data.declined.includes('injuryDate') ||
          (data.injuryYear + data.injuryMonth + data.injuryDay).trim() === '')
      );
    case 'city':
      // A state is the coarsest thing we ask for. City can be blank —
      // "somewhere else" is a real answer — and both can be declined.
      return data.state.trim().length > 0 || cityStepDeclined(data);
    default:
      return true;
  }
}

/**
 * The kind, and what that kind needs: another disability's name, a level for
 * an injury ("Do not know" is a level answer), and nothing for a relative.
 */
export function spinalCordAnswered(data: OnboardingData): boolean {
  if (data.injuryType === 'family') return true;
  if (data.injuryType === 'condition') return data.conditionName.trim() !== '';
  return data.injuryType !== null && data.exactLevel !== null;
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

/**
 * What the city step asks that can be declined: both halves of a place, as
 * the details form offers them (`DECLINABLE_DETAILS`). The owner asked for it
 * on 2026-10-01; until then the state was required to move on, and the only
 * way past it without answering was "Finish later".
 */
export const CITY_STEP_DECLINABLE = ['city', 'state'] as const;

/** Whether every key of a step has been declined. */
function stepDeclined(data: OnboardingData, keys: readonly string[]): boolean {
  return keys.every((key) => data.declined.includes(key));
}

/**
 * Toggle a step's decline.
 *
 * Pressed again it takes the decline back, the same way the survey's does:
 * somebody who changes their mind should not have to guess that the only way
 * out is to answer.
 */
function withStepDeclined(data: OnboardingData, keys: readonly string[], declined: boolean) {
  const rest = data.declined.filter((k) => !keys.includes(k));
  return declined ? [...rest, ...keys] : rest;
}

/** Whether the injury step has already been declined, in whole. */
export function injuryStepDeclined(data: OnboardingData): boolean {
  return stepDeclined(data, INJURY_STEP_DECLINABLE);
}

export function withInjuryDeclined(data: OnboardingData, declined: boolean): string[] {
  return withStepDeclined(data, INJURY_STEP_DECLINABLE, declined);
}

/** Whether the city step has been declined. */
export function cityStepDeclined(data: OnboardingData): boolean {
  return stepDeclined(data, CITY_STEP_DECLINABLE);
}

export function withCityDeclined(data: OnboardingData, declined: boolean): string[] {
  return withStepDeclined(data, CITY_STEP_DECLINABLE, declined);
}
