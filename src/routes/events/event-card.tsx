import { cn } from '@/lib/utils';
import { AttendeeRow } from '@/routes/events/attendee-avatar';
import { isOnline } from '@/routes/events/filters';
import { dateTileParts, shortWeekday, timeRange } from '@/routes/events/format';
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
  /**
   * Drop the bottom margin, because something belongs directly under this card.
   * Used for the occurrences of an expanded series, which read as one block.
   */
  attached?: boolean;
  /**
   * Drawn inside the card's border, under the buttons.
   *
   * The series line lives here rather than under the card. Sat outside, its
   * own margin and the card's were within a pixel of each other, so the line
   * floated exactly between two cards and belonged, visibly, to neither. A
   * rule that says "this card repeats" has to be inside the card it is about.
   */
  footer?: React.ReactNode;
  /**
   * One more date of the series on the card above, rather than an event in its
   * own right.
   *
   * Drops the title, the host and the mark, because all three are identical to
   * the card this sits under — four rows of "The Lionheart Community's Weekl…"
   * spent the whole line on the one thing the reader already knew, and
   * truncated it. What is left is the only thing that differs between
   * occurrences, which is when.
   */
  occurrence?: boolean;
  /**
   * Draw this as a record of something that happened rather than as an offer.
   *
   * Set from the event's own date, not from which segment is showing, because
   * the answer does not change with the segment: there is nothing to decide
   * about an evening that is over, wherever you meet it.
   */
  past?: boolean;
}

export function EventCard({
  event,
  status,
  attendees,
  organization,
  onOpen,
  onRsvp,
  past = false,
  attached = false,
  footer,
  occurrence = false,
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

  // A past event is a line, not a card. Everything the full card carries is
  // there to answer "should I go to this" — the tags, the place, who else is
  // going, and the two buttons — and none of that is a live question once the
  // evening is over. What is left is what a member is actually reading for:
  // when it was, what it was, and whose it was.
  //
  // It stays a button to the detail page. That page still has the description
  // and the link, which is where somebody goes to remember what a thing was.
  if (occurrence) {
    return (
      <div
        className={cn(
          'w-full rounded-[11px] border border-line bg-paper px-3 py-2',
          attached ? 'mb-1' : 'mb-1.5',
        )}
      >
        <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 text-left">
          <span className="block w-[3.25rem] flex-none rounded-[9px] bg-tint px-0 py-1 text-center">
            <span className="block font-extrabold font-head text-[0.875rem] text-navy leading-[1.1]">
              {tile.day}
            </span>
            <span className="block font-extrabold text-[0.5625rem] text-ink2 tracking-[0.08em]">
              {tile.mon}
            </span>
          </span>
          <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink2 leading-[1.35]">
            {shortWeekday(event.startTime, event.timezone)}
            {whenLine ? ` · ${whenLine}` : ''}
          </span>
        </button>
      </div>
    );
  }

  if (past) {
    return (
      <div
        className={cn(
          'w-full rounded-[13px] border border-line bg-paper px-3 py-2.5',
          attached ? 'mb-0' : 'mb-1.5',
        )}
      >
        <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 text-left">
          <span className="block w-[3.25rem] flex-none rounded-[10px] bg-tint px-0 py-1 text-center">
            <span className="block font-extrabold font-head text-[0.9375rem] text-navy leading-[1.1]">
              {tile.day}
            </span>
            <span className="block font-extrabold text-[0.625rem] text-ink2 tracking-[0.08em]">
              {tile.mon}
            </span>
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate font-extrabold font-head text-[0.9375rem] text-ink2 leading-[1.3]">
              {event.title}
            </span>
            {/* Host and time on one line. Two lines of grey under a greyed
                title is most of the height back. */}
            <span className="mt-[2px] block truncate text-[0.75rem] text-grey leading-[1.35]">
              {[metaLine, whenLine].filter(Boolean).join(' · ')}
            </span>
          </span>

          <OrganizationBadge
            organization={organization}
            hostName={event.hostName}
            className="h-[26px] w-[26px] rounded-[9px] text-[0.5625rem]"
          />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative w-full rounded-[17px] border border-line bg-paper p-3.5',
        attached ? 'mb-0' : 'mb-[11px]',
      )}
    >
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

      {footer ? <div className="mt-2.5 border-line border-t pt-1">{footer}</div> : null}
    </div>
  );
}
