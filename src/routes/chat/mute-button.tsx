import { Bell, BellOff } from 'lucide-react';
import { useAccount } from '@/lib/account';
import { type MuteTarget, useMute } from '@/lib/chat/mutes';
import { cn } from '@/lib/utils';

/**
 * Mute notifications from a conversation, a topic or a room.
 *
 * Built on `FollowButton`'s pattern, which the accessibility notes name as the
 * model toggle: `aria-pressed` for the state, and an `aria-label` that says
 * what pressing will do, because the visible word is the state. Sized in `em`
 * off its own letters so it grows with the text-size setting.
 *
 * Draws nothing until it knows the state, and nothing at all while the club
 * cannot send notifications — `useMute` never reads in that case, so `muted`
 * stays null. A mute button with nothing to mute is a control that does
 * nothing.
 *
 * `what` finishes the sentence a screen reader hears: "Mute notifications from
 * this conversation".
 */
export function MuteButton({
  target,
  what,
  className,
}: {
  target: MuteTarget;
  what: string;
  className?: string;
}) {
  const { userId } = useAccount();
  const { muted, busy, error, toggle } = useMute(target, userId);
  if (muted === null) return null;

  const Icon = muted ? BellOff : Bell;
  return (
    <span className={cn('inline-flex flex-col items-end', className)}>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={muted}
        aria-label={
          muted
            ? `Notifications from ${what} are muted. Press to unmute.`
            : `Mute notifications from ${what}`
        }
        data-target="small"
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-[0.85em] py-[0.45em] font-bold font-head text-[0.75rem] leading-[1.3] transition-colors disabled:opacity-50',
          muted ? 'bg-tint text-navy hover:bg-line' : 'border border-line text-navy hover:bg-tint',
        )}
      >
        <Icon aria-hidden="true" className="h-[1.1em] w-[1.1em] flex-none" />
        {muted ? 'Muted' : 'Mute'}
      </button>
      {error ? (
        <span role="alert" className="mt-1 text-[0.75rem] text-destructive leading-[1.4]">
          {error}
        </span>
      ) : null}
    </span>
  );
}
