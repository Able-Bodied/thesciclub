import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AttendeeRow } from '@/routes/events/attendee-avatar';
import { isOnline } from '@/routes/events/filters';
import { dateTileParts, timeRange } from '@/routes/events/format';
import { OrganizationBadge } from '@/routes/events/organization-badge';
import type { ClubEvent, EventAttendee, Organization, RsvpStatus } from '@/types/domain';

/**
 * One event in the list, matching `.ecard` in docs/index.html.
 *
 * Presentational: it takes an event and three handlers, it never fetches, and
 * it holds no state. The optimistic count arithmetic lives in the page, which
 * owns the RSVP that causes it.
 *
 * ---------------------------------------------------------------------------
 * Interested and Going are on the card, not behind a dialog
 * ---------------------------------------------------------------------------
 * ab-peers opened a modal to collect an RSVP. The mock puts both as a button
 * row on the card itself and the owner took that, which is the right call: the
 * decision is one tap and a dialog turns it into three, on a surface somebody
 * is scanning quickly.
 */

export interface EventCardProps {
  event: ClubEvent;
  /** The viewer's own RSVP, or null if they have not said. */
  status: RsvpStatus | null;
  /** Members going, as this viewer may see them — fewer than goingCount if some opted out. */
  attendees: EventAttendee[];
  /** The hosting club organization, when the event links to one. */
  organization: Organization | null;
  onOpen: () => void;
  onRsvp: (next: RsvpStatus | null) => void;
  onDismiss: () => void;
}

export function EventCard({
  event,
  status,
  attendees,
  organization,
  onOpen,
  onRsvp,
  onDismiss,
}: EventCardProps) {
  const tile = dateTileParts(event.startTime, event.timezone);
  const going = status === 'going';
  const interested = status === 'interested';

  // The host line: a club organization if it links to one, otherwise the name
  // the feed gave. Joined from what survives, so an event with neither does not
  // render a lonely separator.
  const host = organization?.name ?? event.hostName;
  const metaLine = [host, event.city].filter(Boolean).join(' · ');
  const whenLine = [timeRange(event.startTime, event.endTime, event.timezone), event.location]
    .filter(Boolean)
    .join(' · ');

  const goingOnly = attendees.filter((a) => a.status === 'going');

  return (
    <div className="relative mb-[11px] w-full rounded-[17px] border border-line bg-paper p-3.5">
      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Not interested in ${event.title}`}
        className="absolute top-[9px] right-2.5 z-[2] grid h-7 w-7 place-items-center rounded-full bg-canvas text-grey"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.2} />
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-[13px] text-left"
      >
        {/* Date and host stacked in one narrow column, so the title always
            starts at the same x no matter which of them is present. */}
        <span className="flex flex-none flex-col items-center gap-2">
          <span className="block w-[58px] rounded-[14px] bg-tint px-0 pt-2 pb-[9px] text-center">
            <span className="block font-extrabold text-[10.5px] text-ink2 tracking-[0.09em]">
              {tile.dow}
            </span>
            <span className="block font-extrabold font-head text-[23px] text-navy leading-[1.15]">
              {tile.day}
            </span>
            <span className="block font-extrabold text-[10.5px] text-ink2 tracking-[0.09em]">
              {tile.mon}
            </span>
          </span>
          <OrganizationBadge organization={organization} hostName={event.hostName} />
        </span>

        <span className="min-w-0 flex-1 pr-5">
          <span className="block font-extrabold font-head text-[16.5px] text-ink leading-[1.28] tracking-[-0.01em]">
            {event.title}
          </span>

          <span className="mt-[7px] flex flex-wrap gap-1.5">
            {/* Format first and in gold, matching the mock: "can I get to this"
                is the question that decides whether the rest of the card is
                worth reading. */}
            {isOnline(event) ? (
              <span className="rounded-full bg-gold-lt px-2.5 py-[5px] font-semibold text-[11.8px] text-gold-dp leading-[1.25]">
                {event.format === 'hybrid' ? 'Hybrid' : 'Online'}
              </span>
            ) : null}
            {event.tags.map((tag) => (
              <span
                key={tag.slug}
                className="rounded-full bg-tint px-2.5 py-[5px] font-semibold text-[11.8px] text-navy leading-[1.25]"
              >
                {tag.name}
              </span>
            ))}
          </span>

          {metaLine ? (
            <span className="mt-[3px] block text-[13px] text-ink2 leading-[1.42]">{metaLine}</span>
          ) : null}
          {whenLine ? (
            <span className="mt-0.5 block text-[12.5px] text-grey leading-[1.42]">{whenLine}</span>
          ) : null}

          {event.goingCount || event.interestedCount ? (
            <span className="mt-2 block font-bold text-[13px] text-navy">
              {event.goingCount} going · {event.interestedCount} interested
            </span>
          ) : null}

          <AttendeeRow attendees={goingOnly} />
        </span>
      </button>

      {/* Capped and left-aligned rather than stretched across the card. On a
          wide screen a half-card-wide button is a long way from the title
          somebody just read, and every RSVP becomes a trip across the screen.
          Full width on a phone, where the card is narrow and the thumb is
          already there. */}
      <div className="mt-3 grid max-w-[420px] grid-cols-2 gap-[9px]">
        <button
          type="button"
          // Pressing the button you are already on takes the RSVP back, which
          // is the only way to undo one from the list.
          onClick={() => {
            onRsvp(interested ? null : 'interested');
          }}
          aria-pressed={interested}
          className={cn(
            'flex min-h-10 items-center justify-center rounded-[13px] font-bold font-head text-[14px]',
            interested ? 'bg-tint text-navy' : 'border-[1.6px] border-navy text-navy',
          )}
        >
          {interested ? 'Interested ✓' : 'Interested'}
        </button>
        <button
          type="button"
          onClick={() => {
            onRsvp(going ? null : 'going');
          }}
          aria-pressed={going}
          className={cn(
            'flex min-h-10 items-center justify-center rounded-[13px] font-bold font-head text-[14px]',
            going ? 'bg-tint text-navy' : 'bg-navy text-white',
          )}
        >
          {going ? 'Going ✓' : 'Going'}
        </button>
      </div>
    </div>
  );
}
