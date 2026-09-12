import { cn } from '@/lib/utils';
import { AttendeeRow } from '@/routes/events/attendee-avatar';
import { isOnline } from '@/routes/events/filters';
import { dateTileParts, timeRange } from '@/routes/events/format';
import { OrganizationBadge } from '@/routes/events/organization-badge';
import { placeLine } from '@/routes/events/place';
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
 *
 * ---------------------------------------------------------------------------
 * There is no "not interested" ✕
 * ---------------------------------------------------------------------------
 * ab-peers had one and this card carried it for a while. It was removed,
 * because nothing consumed the signal: there is no ranking that learns from a
 * dismissal, so hiding an event only ever shortened one list, and the way back
 * was a toggle buried in the filter sheet.
 *
 * It also solved the wrong problem. NorCal SCI's calendar is ~100 events made
 * of ~15 distinct ones repeating weekly, so the annoyance is "not this, ever",
 * and hiding a single occurrence of a Friday group does nothing about next
 * Friday. If that returns it should dismiss a series — and a small ✕ sitting
 * against the edge of a tappable card is a mis-tap waiting to happen for
 * anybody aiming with a head pointer.
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
}

export function EventCard({
  event,
  status,
  attendees,
  organization,
  onOpen,
  onRsvp,
}: EventCardProps) {
  const tile = dateTileParts(event.startTime, event.timezone);
  const going = status === 'going';
  const interested = status === 'interested';

  // The host line: a club organization if it links to one, otherwise the name
  // the feed gave. The city used to sit here too, and the raw location on the
  // line below carried its own copy of it — so every card with an address
  // printed its city twice, a line apart. "Where" is one line now, and the
  // host has this one to itself.
  const metaLine = organization?.name ?? event.hostName;
  const whenLine = timeRange(event.startTime, event.endTime, event.timezone);
  const whereLine = placeLine(event);

  const goingOnly = attendees.filter((a) => a.status === 'going');

  return (
    <div className="relative mb-[11px] w-full rounded-[17px] border border-line bg-paper p-3.5">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-[13px] text-left"
      >
        {/* Date and host stacked in one narrow column, so the title always
            starts at the same x no matter which of them is present. */}
        <span className="flex flex-none flex-col items-center gap-2">
          {/* Width in rem so the tile grows with the text inside it. Left in
              pixels, "SEP" wraps as soon as somebody raises the text size. */}
          <span className="block w-[3.625rem] rounded-[14px] bg-tint px-0 pt-2 pb-[9px] text-center">
            <span className="block font-extrabold text-[0.65625rem] text-ink2 tracking-[0.09em]">
              {tile.dow}
            </span>
            <span className="block font-extrabold font-head text-[1.4375rem] text-navy leading-[1.15]">
              {tile.day}
            </span>
            <span className="block font-extrabold text-[0.65625rem] text-ink2 tracking-[0.09em]">
              {tile.mon}
            </span>
          </span>
          <OrganizationBadge organization={organization} hostName={event.hostName} />
        </span>

        <span className="min-w-0 flex-1 pr-5">
          <span className="block font-extrabold font-head text-[1.03125rem] text-ink leading-[1.28] tracking-[-0.01em]">
            {event.title}
          </span>

          <span className="mt-[7px] flex flex-wrap gap-1.5">
            {/* Format first and in gold, matching the mock: "can I get to this"
                is the question that decides whether the rest of the card is
                worth reading. */}
            {isOnline(event) ? (
              <span className="rounded-full bg-gold-lt px-2.5 py-[5px] font-semibold text-[0.7375rem] text-gold-dp leading-[1.25]">
                {event.format === 'hybrid' ? 'Hybrid' : 'Online'}
              </span>
            ) : null}
            {event.tags.map((tag) => (
              <span
                key={tag.slug}
                className="rounded-full bg-tint px-2.5 py-[5px] font-semibold text-[0.7375rem] text-navy leading-[1.25]"
              >
                {tag.name}
              </span>
            ))}
          </span>

          {metaLine ? (
            <span className="mt-[3px] block text-[0.8125rem] text-ink2 leading-[1.42]">
              {metaLine}
            </span>
          ) : null}
          {whenLine ? (
            <span className="mt-0.5 block text-[0.78125rem] text-grey leading-[1.42]">
              {whenLine}
            </span>
          ) : null}
          {whereLine ? (
            <span className="mt-0.5 block text-[0.78125rem] text-grey leading-[1.42]">
              {whereLine}
            </span>
          ) : null}

          {event.goingCount || event.interestedCount ? (
            <span className="mt-2 block font-bold text-[0.8125rem] text-navy">
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
            'flex min-h-10 items-center justify-center rounded-[13px] font-bold font-head text-[0.875rem]',
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
            'flex min-h-10 items-center justify-center rounded-[13px] font-bold font-head text-[0.875rem]',
            going ? 'bg-tint text-navy' : 'bg-navy text-white',
          )}
        >
          {going ? 'Going ✓' : 'Going'}
        </button>
      </div>
    </div>
  );
}
