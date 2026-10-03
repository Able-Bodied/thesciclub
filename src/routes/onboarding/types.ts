import { readDate } from '@/lib/date-parts';
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
  /**
   * The ISO date, or '' until the three boxes below make a real one. Kept
   * beside them so everything past the birthday step reads one value.
   */
  birthDate: string;
  /** Exactly what was typed — see `lib/date-parts.ts`. */
  birthMonth: string;
  birthDay: string;
  birthYear: string;
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
  /**
   * "Start fresh" was pressed on a claimed seeded profile. Sent with the
   * insert so the claim trigger retires the seed without copying any of it
   * into the new row — see 20261002000000. Until then the trigger could not
   * tell the two buttons apart and copied either way.
   */
  startFresh: boolean;
  /**
   * The two boxes on the phone step, both unticked to begin with: agreeing to
   * the sign-in texts, and to the Terms of Service and Privacy Policy. Kept
   * apart because carriers require it — see `ConsentBox` in steps.tsx.
   */
  smsConsent: boolean;
  termsAgreed: boolean;
}

export const INITIAL_ONBOARDING_DATA: OnboardingData = {
  phone: '',
  code: '',
  displayName: '',
  birthDate: '',
  birthMonth: '',
  birthDay: '',
  birthYear: '',
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
  startFresh: false,
  smsConsent: false,
  termsAgreed: false,
};

/**
 * `claim` appears only when the invite points at a seeded profile, and `blocked`
 * only when the verified number turns out not to be on the list. `agree`
 * appears only for somebody who came through the sign-in door and turned out
 * to be joining. None is a step somebody walks through in order, so none is
 * counted in the progress bar.
 */
export const STEPS = [
  'welcome',
  'phone',
  'code',
  'agree',
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
export function canAdvance(step: Step, data: OnboardingData, signIn = false): boolean {
  switch (step) {
    case 'phone':
      // No code is sent to somebody joining without both ticks: the text is
      // the one thing the club sends to a phone, and carriers require
      // agreement before it. The sign-in door asks with a line instead, and
      // continuing past it is the agreement.
      return isCompletePhone(data.phone) && (signIn || (data.smsConsent && data.termsAgreed));
    case 'code':
      return data.code.replace(/\D/g, '').length === 6;
    case 'agree':
      return data.smsConsent && data.termsAgreed;
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
      // A state is the coarsest thing we ask for. City can be blank —
      // "somewhere else" is a real answer — and both can be declined.
      return data.state.trim().length > 0 || cityStepDeclined(data);
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
