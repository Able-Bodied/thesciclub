import { Link } from 'react-router-dom';

/**
 * The counters under the hero.
 *
 * ---------------------------------------------------------------------------
 * Three, all about events — and none about Chat, on purpose
 * ---------------------------------------------------------------------------
 * The mock's row reads CONVERSATIONS / ROOMS / MEETING UP, from `S.dms.length`,
 * `S.joined.length` and `S.new.going.length`. For a while this file said the
 * first two were missing only because Chat was not built, and when it was
 * (2026-09-18) they went in as a five-tile row. **The owner took them out
 * again on 2026-09-21**, and the reason is worth keeping so nobody puts them
 * back on the strength of the mock: the Chat tab is one tap away and already
 * carries an unread dot, so a count of conversations on Me is a number about
 * a screen the member can see for themselves. The events counters are
 * different — there is no Events dot, and "what have I said I am going to"
 * has no other single answer in the app.
 *
 * So the row carries both halves of an RSVP and the record of what a member
 * has been to. Each goes somewhere, which is more use than a number nobody
 * can act on.
 *
 * Each lands on the events segment of the same name. Interested had no segment
 * to land on for a while and opened the list unfiltered; it has one now, which
 * is the other half of the same pair.
 */

export interface MeStatsProps {
  going: number;
  interested: number;
  /** Events already attended — the record, which has no pill on Events. */
  beenTo: number;
}

function Stat({ value, label, to }: { value: number; label: string; to: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-[68px] flex-1 flex-col items-center justify-center rounded-[14px] border border-line bg-paper px-2 py-2.5 transition-colors hover:border-grey"
    >
      <span className="font-extrabold font-head text-[1.3125rem] text-navy leading-none">
        {value}
      </span>
      <span className="mt-1 text-center font-semibold text-[0.6875rem] text-grey uppercase tracking-[0.09em]">
        {label}
      </span>
    </Link>
  );
}

export function MeStats({ going, interested, beenTo }: MeStatsProps) {
  return (
    <div className="flex gap-2.5">
      <Stat value={going} label="Going" to="/events?segment=going" />
      <Stat value={interested} label="Interested" to="/events?segment=interested" />
      {/* Always, including at zero.

          It used to hide until there was one, reasoning that "Been to 0" on a
          new member's first screen describes an empty past rather than a new
          membership. That reads well and was wrong in use: a counter that comes
          and goes is indistinguishable from a counter that has broken, and the
          owner twice reported the row as missing when it was doing exactly what
          it was told. Going and Interested show zero without anybody minding. */}
      <Stat value={beenTo} label="Been to" to="/events?segment=been-to" />
    </div>
  );
}
