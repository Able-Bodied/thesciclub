import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { countingStrikes, type MyStrike, STRIKE_MONTHS } from '@/routes/me/standing-api';

/**
 * Where a member stands, and why.
 *
 * ---------------------------------------------------------------------------
 * The card had one thing to say and said it to everybody
 * ---------------------------------------------------------------------------
 * It read "Good standing" and listed the four things that end a membership,
 * whatever had actually happened. CONTEXT.md asks that losing membership stay
 * reachable in the product — and a warning a member cannot see is further from
 * reachable than a terms page is.
 *
 * So the card reports the state: the count, each strike, the reason, and the
 * date. The reason especially. Being told you are on two strikes without being
 * told what for is the thing that makes somebody leave quietly rather than
 * correct course, and it is not a punishment anybody decided to hand down.
 *
 * ---------------------------------------------------------------------------
 * Three does not remove anybody
 * ---------------------------------------------------------------------------
 * It says the membership is being reviewed, because that is what is true: an
 * administrator still presses Remove. Saying "you have been removed" on a
 * screen somebody is still reading would be a lie by a few minutes at best,
 * and there is no automatic removal behind it — see the migration header.
 *
 * Withdrawn and expired strikes are not listed. They are on the record and an
 * administrator can see them, but a member reading where they stand today is
 * owed what counts today, not an archive of things that no longer do.
 */

function whenIssued(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

interface Standing {
  title: string;
  Icon: typeof ShieldCheck;
  tone: string;
  /** Said under the count, when there is something to add to it. */
  consequence: string | null;
}

export function standingFor(counting: number): Standing {
  if (counting === 0) {
    return { title: 'Good standing', Icon: ShieldCheck, tone: 'text-gold-dp', consequence: null };
  }
  if (counting === 1) {
    return {
      title: 'One strike',
      Icon: ShieldAlert,
      tone: 'text-gold-dp',
      consequence: `It stops counting ${STRIKE_MONTHS} months after the date shown.`,
    };
  }
  if (counting === 2) {
    return {
      title: 'Two strikes',
      Icon: ShieldAlert,
      tone: 'text-destructive',
      consequence: 'One more ends your membership.',
    };
  }
  return {
    title: 'Your membership is under review',
    Icon: ShieldX,
    tone: 'text-destructive',
    // Not "you have been removed": nothing automatic ends a membership, and an
    // administrator has still to act.
    consequence: 'Three strikes. An administrator will decide what happens next.',
  };
}

export function StandingCard({
  invitedBy,
  strikes,
}: {
  invitedBy: string | null;
  strikes: MyStrike[] | null;
}) {
  const counting = strikes ? countingStrikes(strikes) : [];
  const standing = standingFor(counting.length);
  const { Icon } = standing;

  return (
    <div
      className={cn(
        'rounded-[17px] border p-3.5',
        counting.length >= 2 ? 'border-destructive/40 bg-destructive/5' : 'border-line bg-paper',
      )}
    >
      <div className="flex items-center gap-2.5">
        <Icon className={cn('h-5 w-5 flex-none', standing.tone)} />
        <span className="min-w-0 flex-1">
          <span className="block font-extrabold font-head text-[0.9375rem] text-ink">
            {standing.title}
          </span>
          {invitedBy ? (
            <span className="block text-[0.78125rem] text-grey">Invited by {invitedBy}</span>
          ) : null}
        </span>
      </div>

      {counting.length > 0 ? (
        <>
          <div className="my-3 h-px bg-line" />
          <ul className="flex flex-col gap-2.5">
            {counting.map((strike) => (
              <li key={strike.id}>
                <p className="font-bold text-[0.8125rem] text-ink leading-[1.45]">
                  {strike.reason}
                </p>
                <p className="mt-0.5 text-[0.75rem] text-grey">{whenIssued(strike.issuedAt)}</p>
              </li>
            ))}
          </ul>
          {standing.consequence ? (
            <p className="mt-2.5 font-bold text-[0.78125rem] text-ink2 leading-[1.5]">
              {standing.consequence}
            </p>
          ) : null}
        </>
      ) : null}

      <div className="my-3 h-px bg-line" />
      <HouseRules />
    </div>
  );
}

/**
 * What can end a membership, on demand rather than in full.
 *
 * It was a paragraph on the card. The owner asked for it to come off: the card
 * should say where you stand, and the four things that end a membership belong
 * in the terms of service the club will have — this is the interim until there
 * is one to link to.
 *
 * ---------------------------------------------------------------------------
 * Hover, and not only hover
 * ---------------------------------------------------------------------------
 * Asked for as a hover. Built as hover *plus* focus plus tap, because
 * hover-only would put it out of reach of most of this club: a head pointer or
 * a mouth stick can hover but a switch cannot, and a phone has no hover at all.
 * The same three lines of state serve all three, so there was no reason to pick
 * one.
 *
 * Absolutely positioned so opening it does not push the rest of the column
 * down. A panel that moves the page under a pointer somebody is aiming
 * carefully is worse than no panel.
 */
function HouseRules() {
  const [open, setOpen] = useState(false);
  /**
   * Whether it was opened deliberately rather than passed over.
   *
   * A ref and not state because nothing renders from it, and because the
   * ordering is the whole point: on a touch device a tap fires `mouseenter`
   * *before* `click`, so a plain toggle opened the panel and then closed it
   * again in the same tap. It never opened on a phone. A test written for the
   * touch case caught it; hover and focus both looked fine.
   */
  const pinned = useRef(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          pinned.current = !pinned.current;
          setOpen(pinned.current);
        }}
        onMouseEnter={() => {
          setOpen(true);
        }}
        onMouseLeave={() => {
          if (!pinned.current) setOpen(false);
        }}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          if (!pinned.current) setOpen(false);
        }}
        data-target="small"
        className="rounded font-semibold text-[0.78125rem] text-navy underline decoration-navy/30 underline-offset-2 transition-colors hover:decoration-navy"
      >
        What can end a membership
      </button>
      {open ? (
        <p
          role="note"
          // Downward. Opening upward put the panel over "Good standing" and
          // "Invited by" — the two things the card exists to say — because the
          // trigger sits at the bottom of it. Covering the answer to show a
          // footnote is worse than the paragraph this replaced.
          className="absolute top-full left-0 z-10 mt-1.5 w-full rounded-[11px] border border-line bg-paper p-3 text-[0.78125rem] text-ink2 leading-[1.55] shadow-lg"
        >
          Selling to members, harassing anyone, giving medical advice as fact, or repeating outside
          a room what was said in it.
        </p>
      ) : null}
    </div>
  );
}
