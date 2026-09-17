import { ChevronDown } from 'lucide-react';
import { shortDate } from '@/routes/events/format';
import { cadenceOf, type SeriesGroup } from '@/routes/events/series-groups';
import type { ClubEvent } from '@/types/domain';

/**
 * The line under a repeating event's card: how often it repeats, how many more
 * dates are in front of you, and the way to see them.
 *
 * ---------------------------------------------------------------------------
 * Why the next occurrence, and not a summary
 * ---------------------------------------------------------------------------
 * A collapsed group is still an ordinary event card for a real date, with its
 * own Interested and Going. That is deliberate: `event_rsvps` is keyed to one
 * event, "going to a series" is not something the schema can express, and a
 * card that looked like a series but wrote an RSVP to one hidden occurrence
 * would be lying about what the tap did.
 *
 * So the card says what the next one is and the line underneath says there are
 * more. Nothing is hidden that a member cannot reach in one tap.
 */

/** "8 more dates through 18 Dec", or the singular. Never a bare number. */
function moreDatesLabel(rest: ClubEvent[], timezone: string): string {
  const last = rest[rest.length - 1];
  const count = rest.length;
  const noun = count === 1 ? 'more date' : 'more dates';
  return last
    ? `${count} ${noun} through ${shortDate(last.startTime, timezone)}`
    : `${count} ${noun}`;
}

export interface SeriesFooterProps {
  group: SeriesGroup;
  expanded: boolean;
  onToggle: () => void;
}

export function SeriesFooter({ group, expanded, onToggle }: SeriesFooterProps) {
  if (group.rest.length === 0) return null;

  const cadence = cadenceOf(group);
  const label = moreDatesLabel(group.rest, group.lead.timezone);

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex w-full items-center gap-1.5 rounded-[11px] px-1 py-2 text-left font-semibold text-[0.8125rem] text-navy transition-colors hover:bg-tint"
    >
      <ChevronDown
        className={expanded ? 'h-4 w-4 rotate-180' : 'h-4 w-4'}
        strokeWidth={2.4}
        aria-hidden="true"
      />
      {/* The cadence first: "how often" is what somebody is asking when they
          meet the same title for the second time in a list. */}
      <span>{cadence ? `${cadence} · ${label}` : label}</span>
    </button>
  );
}
