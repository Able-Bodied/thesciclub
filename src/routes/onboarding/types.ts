import { isAdult } from '@/lib/injury';
import { isCompletePhone } from '@/lib/phone';
import type { Completeness, DatePrecision, ExactLevel } from '@/types/domain';

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
      return data.exactLevel !== null && injuryDateOf(data) !== null;
    case 'city':
      // A state is the coarsest thing we always want. City can be blank —
      // "somewhere else" is a real answer.
      return data.state.trim().length > 0;
    default:
      return true;
  }
}
