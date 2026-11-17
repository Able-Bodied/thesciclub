import { INJURY_STAGE_TEXT, injuryStageOf } from '@/lib/injury';
import { cn } from '@/lib/utils';
import type { BrowseMember } from '@/types/domain';

/**
 * How long ago a member was injured, in place of the date, which is hidden
 * unless they show it (20261117030000). Green under six months and orange
 * under two years (the owner, 2026-11-17); white, as the Staff pill, after.
 * Nothing for somebody with no date: family, staff, or "rather not say".
 */
export function InjuryStagePill({
  member,
  className,
}: {
  member: Pick<BrowseMember, 'injuryDate' | 'injuryDatePrecision' | 'injuryStage'>;
  className?: string;
}) {
  const stage = injuryStageOf(member);
  if (!stage) return null;
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center rounded-full px-2.5 py-[5px] font-bold text-[0.75rem] leading-snug',
        stage === 'new'
          ? 'bg-stage-new text-white'
          : stage === 'recent'
            ? 'bg-stage-recent text-white'
            : 'bg-white text-navy',
        className,
      )}
    >
      {INJURY_STAGE_TEXT[stage]}
    </span>
  );
}
