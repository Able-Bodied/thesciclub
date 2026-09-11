import type { Completeness, DatePrecision, LevelRange } from '@/types/domain';

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
  levelRange: LevelRange | null;
  completeness: Completeness;
  /** Stored as a date; asked as a year, refined only if somebody wants to. */
  injuryYear: string;
  injuryMonth: string;
  injuryDay: string;
  city: string;
  state: string;
  photoFile: File | null;
  photoPreviewUrl: string | null;
}

export const INITIAL_ONBOARDING_DATA: OnboardingData = {
  phone: '',
  code: '',
  displayName: '',
  birthDate: '',
  levelRange: null,
  completeness: 'Do not know',
  injuryYear: '',
  injuryMonth: '',
  injuryDay: '',
  city: '',
  state: 'CA',
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
      return data.phone.replace(/\D/g, '').length >= 10;
    case 'code':
      return data.code.replace(/\D/g, '').length === 6;
    case 'name':
      return data.displayName.trim().length > 0;
    case 'birthday':
      return /^\d{4}-\d{2}-\d{2}$/.test(data.birthDate);
    case 'injury':
      return data.levelRange !== null && injuryDateOf(data) !== null;
    case 'city':
      return data.state.trim().length > 0;
    default:
      return true;
  }
}
