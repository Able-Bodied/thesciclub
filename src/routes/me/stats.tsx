import { Link } from 'react-router-dom';

/**
 * The counters under the hero.
 *
 * ---------------------------------------------------------------------------
 * Two, where the mock has three
 * ---------------------------------------------------------------------------
 * The mock's row reads CONVERSATIONS / ROOMS / MEETING UP, from `S.dms.length`,
 * `S.joined.length` and `S.new.going.length`. Two of those three describe
 * features that do not exist: messaging is not built, and topic rooms are
 * deliberately deferred until there are enough members for a room not to be
 * empty by construction (CONTEXT.md).
 *
 * Rendering them would put two invented numbers on the one screen whose job is
 * to tell a member what the club actually knows about them. A zero would be no
 * better — "0 conversations" reads as a product that is failing rather than one
 * that has not shipped that part yet.
 *
 * So the row carries what is real, which is both halves of an RSVP. They also
 * go somewhere, which is more use than a number nobody can act on.
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
