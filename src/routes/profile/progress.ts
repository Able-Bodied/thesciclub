import {
  type DetailKey,
  detailIsFilled,
  detailsPercent,
  type MemberDetails,
} from '@/routes/profile/details-api';
import { type Answers, firstOpenScreen, progressOf, SCREENS } from '@/routes/profile/questions';

/**
 * Your profile as one thing (the owner, 2026-11-12): the details onboarding
 * asked and the survey's questions, in one list, with one percentage and one
 * "what next". Details come first, since Peers and the map read them most.
 *
 * A step is a part of the details form or a screen of the survey. "Next"
 * walks the steps still open, one at a time; "Change" opens one and comes back.
 */
export const DETAIL_PARTS = ['photo', 'name', 'birthday', 'injury', 'place'] as const;
export type DetailPart = (typeof DETAIL_PARTS)[number];

export const PART_TITLES: Record<DetailPart, string> = {
  photo: 'Photo',
  name: 'Name',
  birthday: 'Birthday',
  injury: 'Injury or condition',
  place: 'Where you live',
};

/** The keys a part answers; name and birthday have none, as joining needs them. */
const PART_KEYS: Record<DetailPart, readonly DetailKey[]> = {
  photo: ['photo'],
  name: [],
  birthday: [],
  injury: ['exactLevel', 'injuryDate'],
  place: ['city', 'state'],
};

export type Step = { kind: 'details'; part: DetailPart } | { kind: 'survey'; screen: number };

export function isDetailPart(value: string | null): value is DetailPart {
  return (DETAIL_PARTS as readonly string[]).includes(value ?? '');
}

/** Filled or declined, as the percentage counts it. */
export function partOpen(details: MemberDetails, part: DetailPart): boolean {
  const declined = new Set(details.declined);
  return PART_KEYS[part].some((key) => !declined.has(key) && !detailIsFilled(details, key));
}

/**
 * The first step still open after `after` (or from the start), or null when the
 * profile is complete. Survey screens come after every detail part.
 */
export function nextStep(
  details: MemberDetails,
  answers: Answers,
  declined: ReadonlySet<string>,
  after: Step | null = null,
): Step | null {
  const fromPart = after?.kind === 'details' ? DETAIL_PARTS.indexOf(after.part) + 1 : 0;
  if (after?.kind !== 'survey') {
    const part = DETAIL_PARTS.slice(fromPart).find((p) => partOpen(details, p));
    if (part) return { kind: 'details', part };
  }
  const fromScreen = after?.kind === 'survey' ? after.screen + 1 : 0;
  if (fromScreen >= SCREENS.length) return null;
  const screen = firstOpenScreen(answers, declined, fromScreen);
  return screen === null ? null : { kind: 'survey', screen };
}

/**
 * Where a step opens. `walk` goes on to the next open step after saving;
 * otherwise it is that one step, then back to Your profile.
 */
export function stepHref(step: Step, walk: boolean): string {
  const mode = walk ? 'walk=1' : 'only=1';
  return step.kind === 'details'
    ? `/profile/details?part=${step.part}&${mode}`
    : `/profile?screen=${step.screen}&${mode}`;
}

/** The one percentage Me, Home and Your profile show: details and answers, half each. */
export function profilePercent(
  details: MemberDetails,
  answers: Answers,
  declined: ReadonlySet<string>,
): number {
  return Math.round((detailsPercent(details) + progressOf(answers, declined).percent) / 2);
}
