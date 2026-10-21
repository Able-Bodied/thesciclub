import { useHomeState } from '@/lib/home-state';
import { stateNameFor } from '@/types/domain';

/**
 * "Out of state · Georgia" on an in-person event in another state than the
 * member's (20261021040000), so a far-away tournament is plain at a glance.
 * Nothing for an online event, an unknown place, or a member with no state.
 */
export function OutOfStateMark({
  state,
  onNavy = false,
  className,
}: {
  state: string | null;
  /** On the event page's navy header, in its chips' colours. */
  onNavy?: boolean;
  className?: string;
}) {
  const home = useHomeState();
  if (!state || !home || state === home) return null;
  const colours = onNavy ? 'bg-plate-chip text-[#DDE7F3]' : 'border border-line bg-tint text-ink2';
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-[3px] font-semibold text-[0.75rem] ${colours} ${className ?? ''}`}
    >
      Out of state · {stateNameFor(state) ?? state}
    </span>
  );
}
