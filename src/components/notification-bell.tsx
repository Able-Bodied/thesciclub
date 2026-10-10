import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUnseenNotifications } from '@/lib/notifications';
import { cn } from '@/lib/utils';

/**
 * The way to the notifications list, with what has arrived since it was last
 * opened.
 *
 * Two places, one each per width: Home's header on a phone, where the app
 * opens, and the end of the top bar on a desktop. `variant` is which.
 *
 * The number is in the link's name ("Notifications, 3 new"), and drawn as a
 * number rather than a dot so it says how much; past nine it says "9+", which
 * is all the badge has room for at the largest text size.
 */
export function NotificationBell({
  variant,
  className,
}: {
  variant: 'round' | 'bar';
  className?: string;
}) {
  const { count } = useUnseenNotifications();
  const label = count > 0 ? `Notifications, ${count} new` : 'Notifications';
  const badge =
    count > 0 ? (
      <span
        aria-hidden="true"
        className="-top-1 -right-1 absolute grid h-[1.35em] min-w-[1.35em] place-items-center rounded-full bg-destructive-fill px-1 font-bold text-[0.6875rem] text-white leading-none ring-2 ring-paper"
      >
        {count > 9 ? '9+' : count}
      </span>
    ) : null;

  if (variant === 'round') {
    return (
      <Link
        to="/notifications"
        aria-label={label}
        className={cn(
          'relative grid h-[44px] w-[44px] flex-none place-items-center rounded-full bg-tint transition-colors hover:bg-line',
          className,
        )}
      >
        <Bell aria-hidden="true" className="h-[19px] w-[19px] text-emphasis" strokeWidth={2} />
        {badge}
      </Link>
    );
  }

  return (
    <Link
      to="/notifications"
      aria-label={label}
      className={cn(
        'relative flex items-center gap-2 rounded-xl px-3 py-1.5 font-bold text-[0.875rem] text-grey hover:bg-tint',
        className,
      )}
    >
      <span className="relative grid h-7 w-7 place-items-center rounded-[10px]">
        <Bell aria-hidden="true" className="h-[20px] w-[20px]" />
        {badge}
      </span>
      <span>Notifications</span>
    </Link>
  );
}
