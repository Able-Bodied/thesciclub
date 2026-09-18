import { Check, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Follow an organization, or stop.
 *
 * One component for both places it appears, so the two cannot drift into
 * disagreeing about what the states are called — which is the fault
 * `organization-badge.tsx` was written to fix, after three screens each grew
 * their own gold tile and none of them could show a logo.
 *
 * ---------------------------------------------------------------------------
 * The label says the state, not the action
 * ---------------------------------------------------------------------------
 * "Following" rather than "Unfollow". A button that names the action it will
 * perform is right where the action is the point — Withdraw, Remove, Pause —
 * and wrong for a toggle somebody scans a list of, because then the list reads
 * as a column of things to undo. `aria-pressed` carries the action for anybody
 * who needs it said out loud, which is the mechanism that exists for exactly
 * this.
 *
 * ---------------------------------------------------------------------------
 * `onNavy` is a second palette, not a second component
 * ---------------------------------------------------------------------------
 * The organization page's header is navy and the directory's rows are paper, so
 * the same button needs two sets of colours. Both are checked in
 * theme-contrast.test.ts alongside the rest of the palette: a hover colour
 * picked by eye is exactly where this project has dropped under AA before.
 */
export function FollowButton({
  following,
  onToggle,
  onNavy = false,
  className,
}: {
  following: boolean;
  onToggle: () => void;
  /** For the organization page's navy header, where the paper palette vanishes. */
  onNavy?: boolean;
  className?: string;
}) {
  const Icon = following ? Check : Plus;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={following}
      // Named for the action, because the visible label is the state. Without
      // this a screen reader announces "Following, button" and there is nothing
      // to tell somebody what pressing it does.
      aria-label={following ? 'Following. Press to unfollow.' : 'Follow'}
      className={cn(
        // Sized in em off its own letters, not in px. The club offers a text
        // size setting that multiplies the root font size, so a px box around
        // rem text stops fitting at the larger settings — the rule the profile
        // ring and the organization tile were both fixed to follow.
        'inline-flex items-center gap-1 rounded-full px-[0.85em] py-[0.45em] font-bold font-head text-[0.78125rem] leading-[1.3] transition-colors',
        onNavy
          ? following
            ? 'bg-white/15 text-white hover:bg-white/25'
            : 'bg-white text-navy hover:bg-[#E8EFF7]'
          : following
            ? 'bg-tint text-navy hover:bg-line'
            : 'border-[1.6px] border-navy text-navy hover:bg-tint',
        className,
      )}
    >
      <Icon className="h-[1em] w-[1em] flex-none" />
      {following ? 'Following' : 'Follow'}
    </button>
  );
}
