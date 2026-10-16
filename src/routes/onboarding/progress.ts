import { getSupabase } from '@/lib/supabase';
import type { OnboardingData, Step } from '@/routes/onboarding/types';

/**
 * Onboarding picks up where it was left (the owner, 2026-10-15).
 *
 * Two copies of the answers so far, so closing the app halfway costs nothing:
 *
 * - On the device, as each answer is typed, under the account's id, so a
 *   second person on the same phone never opens someone else's answers.
 * - On the account (save_onboarding_progress, 20261015015000), each time the
 *   wizard moves on, so the next phone opens at the same step. The database
 *   keeps it until the member is made, or 90 days untouched.
 *
 * Whichever copy is newer wins. Saving never stands in anybody's way: a
 * failure is silent and the next step tries again.
 *
 * Never the password, the email, the ZIP or the photograph — the same list
 * the database keeps (private.onboarding_answers).
 */

export const RESUMABLE_STEPS = [
  'name',
  'username',
  'birthday',
  'injury',
  'city',
  'phone',
  'photo',
] as const satisfies readonly Step[];

export type ResumableStep = (typeof RESUMABLE_STEPS)[number];

export function isResumable(step: Step): step is ResumableStep {
  return (RESUMABLE_STEPS as readonly Step[]).includes(step);
}

const KEPT = [
  'displayName',
  'username',
  'usernameChecked',
  'birthMonth',
  'birthDay',
  'birthYear',
  'birthDate',
  'injuryType',
  'exactLevel',
  'conditionName',
  'completeness',
  'injuryYear',
  'injuryMonth',
  'injuryDay',
  'city',
  'state',
  'phone',
  'declined',
] as const satisfies readonly (keyof OnboardingData)[];

export type KeptAnswers = Partial<Pick<OnboardingData, (typeof KEPT)[number]>>;

export interface SavedProgress {
  step: ResumableStep;
  answers: KeptAnswers;
  /** ISO time, to choose the newer of the two copies. */
  savedAt: string;
}

/** Only what may be kept, whatever else `data` holds. */
export function keptAnswers(data: Partial<OnboardingData>): KeptAnswers {
  const kept: Record<string, unknown> = {};
  for (const key of KEPT) if (data[key] !== undefined) kept[key] = data[key];
  return kept;
}

function deviceKey(userId: string): string {
  return `sciclub.onboarding.${userId}`;
}

function asSaved(value: unknown): SavedProgress | null {
  if (!value || typeof value !== 'object') return null;
  const { step, answers, savedAt } = value as Record<string, unknown>;
  if (typeof step !== 'string' || !isResumable(step as Step)) return null;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return null;
  if (typeof savedAt !== 'string') return null;
  return { step: step as ResumableStep, answers: keptAnswers(answers), savedAt };
}

export function saveOnDevice(userId: string, step: ResumableStep, data: OnboardingData): void {
  try {
    const saved: SavedProgress = {
      step,
      answers: keptAnswers(data),
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(deviceKey(userId), JSON.stringify(saved));
  } catch {
    // Private browsing, or storage full: the account's copy still follows.
  }
}

export function readFromDevice(userId: string): SavedProgress | null {
  try {
    const raw = window.localStorage.getItem(deviceKey(userId));
    return raw ? asSaved(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function forgetOnDevice(userId: string): void {
  try {
    window.localStorage.removeItem(deviceKey(userId));
  } catch {
    // Nothing to do: it was never kept.
  }
}

export async function saveToAccount(step: ResumableStep, data: OnboardingData): Promise<void> {
  try {
    await getSupabase().rpc('save_onboarding_progress', { step, answers: keptAnswers(data) });
  } catch {
    // Tried again at the next step.
  }
}

export async function readFromAccount(): Promise<SavedProgress | null> {
  try {
    const { data, error } = (await getSupabase().rpc('my_onboarding_progress')) as {
      data: { step: string; answers: unknown; updated_at: string }[] | null;
      error: unknown;
    };
    const row = error ? undefined : data?.[0];
    return row ? asSaved({ step: row.step, answers: row.answers, savedAt: row.updated_at }) : null;
  } catch {
    return null;
  }
}

/** The newer of the device's copy and the account's, or null for a fresh start. */
export async function savedProgress(userId: string): Promise<SavedProgress | null> {
  const device = readFromDevice(userId);
  const account = await readFromAccount();
  if (!device) return account;
  if (!account) return device;
  return Date.parse(account.savedAt) > Date.parse(device.savedAt) ? account : device;
}
