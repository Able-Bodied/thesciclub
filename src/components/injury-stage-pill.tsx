import { injuryStageOf, injuryStageText } from '@/lib/injury';
import { cn } from '@/lib/utils';
import type { BrowseMember, InjuryStage } from '@/types/domain';

/**
 * Each stage's colour, on its words (the owner, 2026-11-17: the words in the
 * colour; a band took too much room and a dot was too subtle). The light
 * set is for words over a photograph (Peers' cards and profiles), always dark.
 */
const STAGE_TEXT: Record<InjuryStage, string> = {
  new: 'text-stage-new-text',
  recent: 'text-stage-recent-text',
  years: 'text-stage-years-text',
  og: 'text-stage-og-text',
  oog: 'text-stage-oog-text',
};
const STAGE_ON_PHOTO: Record<InjuryStage, string> = {
  new: 'text-stage-new-light',
  recent: 'text-stage-recent-light',
  years: 'text-stage-years-light',
  og: 'text-stage-og-light',
  oog: 'text-stage-oog-light',
};

type Staged = Pick<
  BrowseMember,
  'injuryDate' | 'injuryDatePrecision' | 'injuryStage' | 'injuryType'
>;

/**
 * How long ago, as the last part of a summary line over a photograph, in its
 * stage's colour: "10+ years since injury", kept whole. Nothing where
 * there is no date (family, staff, "rather not say"). The date itself is
 * hidden unless its member shows it (20261117030000), so the stage is drawn.
 */
export function InjuryStagePart({ member }: { member: Staged }) {
  const stage = injuryStageOf(member);
  if (!stage) return null;
  return (
    <span className={cn('whitespace-nowrap font-semibold', STAGE_ON_PHOTO[stage])}>
      {injuryStageText(stage, member.injuryType)}
    </span>
  );
}

/**
 * The level in a chat byline and on Home, in its stage's colour.
 * The words on hover or a long press, and said aloud, so the colour is never
 * the only way to know the stage. No date, no colour.
 */
export function LevelHighlight({
  level,
  stage,
  injuryType = null,
}: {
  level: string;
  stage?: InjuryStage | null | undefined;
  injuryType?: string | null | undefined;
}) {
  if (!stage) return <>{level}</>;
  return (
    <span
      title={injuryStageText(stage, injuryType)}
      className={cn('font-semibold', STAGE_TEXT[stage])}
    >
      {level}
      <span className="sr-only">, {injuryStageText(stage, injuryType).toLowerCase()}</span>
    </span>
  );
}
