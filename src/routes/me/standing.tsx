import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
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
 * visible in the product rather than behind a terms page — and a warning a
 * member cannot see is further from visible than a terms page is.
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
      {/* The mock links this to a house-rules page. There is no such page, so
          the rule is stated here instead of behind a link that goes nowhere —
          and CONTEXT.md asks that losing membership stay visible in the product
          rather than buried in a terms page, which an inline sentence does
          better than a link anyway. */}
      <p className="text-[0.78125rem] text-ink2 leading-[1.55]">
        Membership can be lost. Selling to members, harassing anyone, giving medical advice as fact,
        or repeating outside a room what was said in it all end it.
      </p>
    </div>
  );
}
