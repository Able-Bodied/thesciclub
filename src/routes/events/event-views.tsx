import { Eye } from 'lucide-react';
import { useEventViewStats } from '@/lib/event-views';

/**
 * Views, for the club's administrators and the event's org admins (the owner,
 * 2026-11-02): in the app and on the public page, apart. Nothing while loading
 * or when the counts cannot be read.
 */
export function EventViewsLine({ eventId, allowed }: { eventId: string; allowed: boolean }) {
  const stats = useEventViewStats(eventId, allowed);
  if (!allowed || !stats) return null;
  const times = (n: number) => `${n} ${n === 1 ? 'time' : 'times'}`;
  return (
    <div className="mt-5 rounded-[14px] border border-line bg-paper p-3.5 text-[0.8125rem] text-ink2 leading-[1.5]">
      <p className="flex items-center gap-1.5 font-bold text-ink">
        <Eye className="h-[15px] w-[15px]" aria-hidden="true" />
        Views
      </p>
      <p className="mt-1">
        In the app: {stats.members} {stats.members === 1 ? 'member' : 'members'}, opened{' '}
        {times(stats.memberOpens)}
      </p>
      <p>
        Public page: opened {times(stats.publicOpens)}, RSVP tapped {times(stats.rsvpClicks)},
        Interested tapped {times(stats.interestedClicks)}
      </p>
    </div>
  );
}
