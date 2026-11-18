import { injuryStageOf, injuryStageText } from '@/lib/injury';
import { cn } from '@/lib/utils';
import type { BrowseMember, InjuryStage } from '@/types/domain';

/**
 * Each stage's colour at half strength behind the words, in regular weight
 * (the owner, 2026-11-17: coloured words "blend in to the background too
 * much", back to pills, "50% with white text, but not bolded"). The words are
 * white over photographs; in a byline they are --ink, near white on a dark
 * page and navy on a light one, where white on half a colour would not read.
 */
const STAGE_PILL: Record<InjuryStage, string> = {
  new: 'bg-stage-new/50',
  recent: 'bg-stage-recent/50',
  years: 'bg-stage-years/50',
  og: 'bg-stage-og/50',
  oog: 'bg-stage-oog/50',
};
/**
 * Fainter in a byline, on Home and in chats (the owner, 2026-11-17: "more
 * transparent on home and in chat"); the cards' pills stay at half.
 */
const BYLINE_PILL: Record<InjuryStage, string> = {
  new: 'bg-stage-new/30',
  recent: 'bg-stage-recent/30',
  years: 'bg-stage-years/30',
  og: 'bg-stage-og/30',
  oog: 'bg-stage-oog/30',
};

type Staged = Pick<
  BrowseMember,
  'injuryDate' | 'injuryDatePrecision' | 'injuryStage' | 'injuryType'
>;

/**
 * How long ago, as a pill on its own line under the summary line of Peers'
 * cards and profiles, always over a photograph's shade: "Injured 10+ years".
 * Nothing where there is no date (family, staff, "rather not say"). The date
 * itself is hidden unless its member shows it (20261117030000), so the stage
 * is drawn.
 */
export function InjuryStageNote({ member, className }: { member: Staged; className?: string }) {
  const stage = injuryStageOf(member);
  if (!stage) return null;
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center rounded-full px-2.5 py-[3px] font-normal text-[0.8125rem] text-white leading-snug',
        STAGE_PILL[stage],
        className,
      )}
    >
      {injuryStageText(stage, member.injuryType)}
    </span>
  );
}

/**
 * The level in a chat byline and on Home, as a pill in its stage's colour.
 * The words on hover or a long press, and said aloud, so the colour is never
 * the only way to know the stage. No date, no pill.
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
      className={cn(
        'box-decoration-clone rounded-full px-1.5 font-normal text-ink',
        BYLINE_PILL[stage],
      )}
    >
      {level}
      <span className="sr-only">, {injuryStageText(stage, injuryType).toLowerCase()}</span>
    </span>
  );
}
