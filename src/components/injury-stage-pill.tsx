import { injuryStageOf, injuryStageText } from '@/lib/injury';
import { cn } from '@/lib/utils';
import type { BrowseMember, InjuryStage } from '@/types/domain';

type Staged = Pick<
  BrowseMember,
  'injuryDate' | 'injuryDatePrecision' | 'injuryStage' | 'injuryType'
>;

/**
 * The injury level on a photograph, in a bubble coloured by how long ago
 * (the owner, 2026-11-17: "have the color coding on the injury LEVEL ... a
 * little bubble around their injury level"). Green under six months, orange
 * under two years, a light glass after; plain words where there is no date
 * (family, staff, "rather not say"). The date itself is hidden unless its
 * member shows it (20261117030000), so the stage is what is drawn.
 */
export function LevelBubble({ member, level }: { member: Staged; level: string }) {
  const stage = injuryStageOf(member);
  if (!stage) return <>{level}</>;
  return (
    <span
      className={cn(
        'box-decoration-clone rounded-full px-2 py-[2px] font-semibold [text-shadow:none]',
        stage === 'new'
          ? 'bg-stage-new text-white'
          : stage === 'recent'
            ? 'bg-stage-recent text-navy'
            : 'bg-white/25 text-white',
      )}
    >
      {level}
    </span>
  );
}

/**
 * The stage in words, under the bubble, so the colour is never the only
 * thing that says it: "Newly injured", "OG · 10+ years".
 */
export function InjuryStageNote({ member, className }: { member: Staged; className?: string }) {
  const stage = injuryStageOf(member);
  if (!stage) return null;
  return (
    <span
      className={cn(
        'block font-semibold text-[0.78125rem] text-white leading-[1.45] [text-shadow:0_1px_10px_rgba(0,0,0,.8)]',
        className,
      )}
    >
      {injuryStageText(stage, member.injuryType)}
    </span>
  );
}

/**
 * The level in a chat byline, highlighted green or orange as on the cards
 * (the owner, 2026-11-17: "keep the color coding in the chats and messages?
 * Just a highlight around the level"). Only the two early stages are
 * coloured; a later one reads as plain words, as before. The stage is said
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
  if (stage !== 'new' && stage !== 'recent') return <>{level}</>;
  return (
    <span
      className={cn(
        'box-decoration-clone rounded-full px-1.5 font-semibold',
        stage === 'new' ? 'bg-stage-new text-white' : 'bg-stage-recent text-navy',
      )}
    >
      {level}
      <span className="sr-only">, {injuryStageText(stage, injuryType).toLowerCase()}</span>
    </span>
  );
}
