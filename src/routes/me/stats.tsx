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
 * empty by construction (docs/CONTEXT.md).
 *
 * Rendering them would put two invented numbers on the one screen whose job is
 * to tell a member what the club actually knows about them. A zero would be no
 * better — "0 conversations" reads as a product that is failing rather than one
 * that has not shipped that part yet.
 *
 * So the row carries what is real, which is both halves of an RSVP. They also
 * go somewhere: each is a link into the Events tab filtered to that answer,
 * which is more use than a number nobody can act on.
 */

export interface MeStatsProps {
  going: number;
  interested: number;
}

function Stat({ value, label, to }: { value: number; label: string; to: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-[68px] flex-1 flex-col items-center justify-center rounded-[14px] border border-line bg-paper px-2 py-2.5"
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

export function MeStats({ going, interested }: MeStatsProps) {
  return (
    <div className="flex gap-2.5">
      <Stat value={going} label="Going" to="/events" />
      <Stat value={interested} label="Interested" to="/events" />
    </div>
  );
}
