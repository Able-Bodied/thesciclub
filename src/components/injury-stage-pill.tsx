import { injuryBandOf, injuryStageOf, injuryStageText, stageBand } from '@/lib/injury';
import { cn } from '@/lib/utils';
import type { BrowseMember, InjuryBand, InjuryStage } from '@/types/domain';

/**
 * Each band's colour at half strength behind the words, in regular weight
 * (the owner, 2026-11-17: "50% with white text, but not bolded"), ten bands
 * from green to red at ten years to dark purple (2026-11-18). The words are
 * white over photographs; in a byline they are --ink, near white on a dark
 * page and navy on a light one, where white on half a colour would not read.
 */
const BAND_PILL: Record<InjuryBand, string> = {
  0: 'bg-band-0/50',
  1: 'bg-band-1/50',
  2: 'bg-band-2/50',
  3: 'bg-band-3/50',
  4: 'bg-band-4/50',
  5: 'bg-band-5/50',
  6: 'bg-band-6/50',
  7: 'bg-band-7/50',
  8: 'bg-band-8/50',
  9: 'bg-band-9/50',
};
/**
 * Fainter in a byline, on Home and in chats (the owner, 2026-11-17: "more
 * transparent on home and in chat"); the cards' pills stay at half.
 */
const BYLINE_PILL: Record<InjuryBand, string> = {
  0: 'bg-band-0/30',
  1: 'bg-band-1/30',
  2: 'bg-band-2/30',
  3: 'bg-band-3/30',
  4: 'bg-band-4/30',
  5: 'bg-band-5/30',
  6: 'bg-band-6/30',
  7: 'bg-band-7/30',
  8: 'bg-band-8/30',
  9: 'bg-band-9/30',
};

type Staged = Pick<
  BrowseMember,
  'injuryDate' | 'injuryDatePrecision' | 'injuryStage' | 'injuryBand' | 'injuryType'
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
  const band = injuryBandOf(member);
  if (!stage || band === null) return null;
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center rounded-full px-2.5 py-[3px] font-normal text-[0.8125rem] text-white leading-snug',
        BAND_PILL[band],
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
  band,
  injuryType = null,
}: {
  level: string;
  stage?: InjuryStage | null | undefined;
  /** The colour's band; the stage's own where the database sent none. */
  band?: InjuryBand | null | undefined;
  injuryType?: string | null | undefined;
}) {
  if (!stage) return <>{level}</>;
  return (
    <span
      title={injuryStageText(stage, injuryType)}
      className={cn(
        'box-decoration-clone rounded-full px-1.5 font-normal text-ink',
        BYLINE_PILL[band ?? stageBand(stage)],
      )}
    >
      {level}
      <span className="sr-only">, {injuryStageText(stage, injuryType).toLowerCase()}</span>
    </span>
  );
}
