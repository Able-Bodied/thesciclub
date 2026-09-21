import { Link } from 'react-router-dom';

/**
 * The counters under the hero.
 *
 * ---------------------------------------------------------------------------
 * Five, where the mock has three
 * ---------------------------------------------------------------------------
 * The mock's row reads CONVERSATIONS / ROOMS / MEETING UP, from `S.dms.length`,
 * `S.joined.length` and `S.new.going.length`. Two of those three described
 * features that did not exist when this was written, so the row carried what
 * was real instead: both halves of an RSVP, and the record of what a member has
 * already been to.
 *
 * Chat shipped, so the other two are countable and are here. The rule this file
 * has always applied is unchanged — **a number goes on this screen when it can
 * be counted, not when the table exists.** `chat_my_threads()` is the
 * conversations a member is in and `chat_room_members` is the rooms they
 * joined; both are read by the screen that draws them and neither is derived
 * from anything.
 *
 * Zero is drawn, for all five. A member with no conversations has none, and
 * that is a true thing about their membership rather than a hole in the
 * product — the reasoning under "Been to" below is the same argument and was
 * settled by the owner reporting a counter that hid itself as broken twice.
 *
 * Every tile goes somewhere, which is what separates a counter from a
 * decoration: the two new ones land on the segment of /chat they counted.
 *
 * ---------------------------------------------------------------------------
 * Three then two, rather than five across
 * ---------------------------------------------------------------------------
 * At 430px five tiles are about 71px wide and "Conversations" does not fit in
 * one. The grid is six columns so the first three can take two each and the
 * last two three each — an even second row rather than a ragged one with a
 * hole where a sixth counter would go. From `sm` the whole row fits and it is
 * five columns, which is what the 720px measure was always wide enough for.
 */

export interface MeStatsProps {
  going: number;
  interested: number;
  /** Events already attended — the record, which has no pill on Events. */
  beenTo: number;
  /** Direct conversations and groups together, as /chat lists them. */
  conversations: number;
  /** Discussion rooms this member has joined, not rooms that are open. */
  rooms: number;
}

function Stat({
  value,
  label,
  to,
  span,
}: {
  value: number;
  label: string;
  to: string;
  /** How many of the six narrow columns this tile takes. */
  span: 'two' | 'three';
}) {
  return (
    <Link
      to={to}
      className={`flex min-h-[68px] flex-col items-center justify-center rounded-[14px] border border-line bg-paper px-2 py-2.5 transition-colors hover:border-grey sm:col-span-1 ${
        span === 'two' ? 'col-span-2' : 'col-span-3'
      }`}
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

export function MeStats({ going, interested, beenTo, conversations, rooms }: MeStatsProps) {
  return (
    <div className="grid grid-cols-6 gap-2.5 sm:grid-cols-5">
      <Stat value={going} label="Going" to="/events?segment=going" span="two" />
      <Stat value={interested} label="Interested" to="/events?segment=interested" span="two" />
      {/* Always, including at zero.

          It used to hide until there was one, reasoning that "Been to 0" on a
          new member's first screen describes an empty past rather than a new
          membership. That reads well and was wrong in use: a counter that comes
          and goes is indistinguishable from a counter that has broken, and the
          owner twice reported the row as missing when it was doing exactly what
          it was told. Going and Interested show zero without anybody minding. */}
      <Stat value={beenTo} label="Been to" to="/events?segment=been-to" span="two" />
      {/* Both halves of /chat's list, counted the way the list counts them: a
          group is a conversation. Landing on All rather than Direct for the
          same reason. */}
      <Stat value={conversations} label="Conversations" to="/chat" span="three" />
      {/* Rooms joined, not rooms open. The difference is the point — joining is
          what puts a composer in a room, and reading one needs nothing. */}
      <Stat value={rooms} label="Rooms" to="/chat?segment=rooms" span="three" />
    </div>
  );
}
