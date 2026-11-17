import { injuryStageOf, injuryStageText } from '@/lib/injury';
import { cn } from '@/lib/utils';
import type { BrowseMember, InjuryStage } from '@/types/domain';

/**
 * Each stage's colour (the owner, 2026-11-17): green, orange, then teal,
 * purple and magenta for 2–10 years, OG and OOG.
 */
const STAGE_COLOUR: Record<InjuryStage, string> = {
  new: 'bg-stage-new text-white',
  recent: 'bg-stage-recent text-navy',
  years: 'bg-stage-years text-white',
  og: 'bg-stage-og text-white',
  oog: 'bg-stage-oog text-white',
};

type Staged = Pick<
  BrowseMember,
  'injuryDate' | 'injuryDatePrecision' | 'injuryStage' | 'injuryType'
>;

/**
 * How long ago, as a pill in its stage's colour, under the level on Peers'
 * cards and profiles (the owner, 2026-11-17: the colour on "the age of the
 * injury ... not the level. This makes it more clear where the color is
 * coming from"). Its words say the stage, so the colour is never alone:
 * "Newly injured", "OG · 10+ years". Nothing where there is no date (family,
 * staff, "rather not say"). The date itself is hidden unless its member shows
 * it (20261117030000), so the stage is what is drawn.
 */
export function InjuryStageNote({ member, className }: { member: Staged; className?: string }) {
  const stage = injuryStageOf(member);
  if (!stage) return null;
  return (
    <span
      className={cn(
        // A thin light edge, so a pill shows on a card of its own colour.
        'inline-flex max-w-full items-center rounded-full px-2.5 py-[3px] font-semibold text-[0.78125rem] leading-snug ring-1 ring-white/70',
        STAGE_COLOUR[stage],
        className,
      )}
    >
      {injuryStageText(stage, member.injuryType)}
    </span>
  );
}

/**
 * The level in a chat byline, highlighted in its stage's colour as the cards' pill
 * (the owner, 2026-11-17: "keep the color coding in the chats and messages?
 * Just a highlight around the level"), on Home too. Every stage has its
 * colour; no date, no highlight. The stage is said
 * aloud too, so the colour is not the only way to know it.
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
  // The words on hover or a long press too, so the colour can be asked about.
  return (
    <span
      title={injuryStageText(stage, injuryType)}
      className={cn('box-decoration-clone rounded-full px-1.5 font-semibold', STAGE_COLOUR[stage])}
    >
      {level}
      <span className="sr-only">, {injuryStageText(stage, injuryType).toLowerCase()}</span>
    </span>
  );
}
