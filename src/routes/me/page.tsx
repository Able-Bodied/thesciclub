import { ChevronRight, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { signOut, useAccount } from '@/lib/account';
import { useViewerEvents } from '@/lib/events';
import { useOwnMember } from '@/lib/members';
import { isPastStartTime } from '@/routes/events/filters';
import { AccessibilitySettings } from '@/routes/me/accessibility-settings';
import { DeckVisibility } from '@/routes/me/deck-visibility';
import { MeHero } from '@/routes/me/hero';
import { MeStats } from '@/routes/me/stats';
import { listInWords, loadDetails, missingDetails } from '@/routes/profile/details-api';
import { loadAnswers } from '@/routes/profile/profile-api';
import { progressOf } from '@/routes/profile/questions';
import type { RsvpStatus } from '@/types/domain';

/**
 * Me — who the club thinks you are, where you stand, and the way out.
 *
 * Follows `mePage()` in the mock: a navy hero, counters, then Your profile,
 * Standing and Invites as cards. Two departures, both for the same reason —
 * nothing here is allowed to be invented, because this is the screen a member
 * reads to find out what the club actually knows about them. See
 * src/routes/me/stats.tsx for the counters, and the Standing card below for
 * why there is no link on the house rules.
 *
 * On a wide screen the cards go into two columns rather than one long strip.
 * They are independent panels, not a sequence, so the second column costs
 * nothing to read and halves the distance to the bottom of the page.
 */

/** A section heading, matching `.sec` in the mock. */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-5 mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
      {children}
    </h2>
  );
}
/** A ring rather than a bar: it sits beside a line of text, not under one. */
function ProgressRing({ percent }: { percent: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  return (
    // Sized in `em` off its own label rather than in pixels, so the circle grows
    // with the number inside it. At the largest text setting a fixed 46px ring
    // held "13%" and clipped "100%" to "00%" — the one member it happened to
    // was the one who had finished their profile.
    <span className="relative grid h-[3.85em] w-[3.85em] flex-none place-items-center text-[0.75rem]">
      <svg
        viewBox="0 0 44 44"
        className="-rotate-90 absolute h-[3.85em] w-[3.85em]"
        aria-hidden="true"
      >
        <circle cx="22" cy="22" r={radius} fill="none" stroke="var(--tint)" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke="var(--navy)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent / 100)}
        />
      </svg>
      <span className="relative font-extrabold font-head text-navy">{percent}%</span>
    </span>
  );
}

export default function MePage() {
  const { userId, displayName, isAdmin } = useAccount();
  const { member, invitedBy } = useOwnMember(userId);
  const viewer = useViewerEvents(userId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  // Null until the details load, so the switch is not drawn in the wrong
  // position for a moment and then corrected under the reader's eye.
  const [showInBrowse, setShowInBrowse] = useState<boolean | null>(null);

  // What the member has coming up, not what they have ever said yes to. These
  // two numbers are the whole of the row, and a count that keeps climbing as
  // events go by stops answering "what have I got on" — which is the only
  // question somebody reads them for. An RSVP whose date did not come back is
  // not counted: a number that guesses is worse than one that waits.
  const countUpcoming = (want: RsvpStatus) =>
    [...viewer.rsvps.entries()].filter(([eventId, status]) => {
      if (status !== want) return false;
      const startTime = viewer.startTimes.get(eventId);
      return startTime !== undefined && !isPastStartTime(startTime);
    }).length;

  const going = countUpcoming('going');
  const interested = countUpcoming('interested');

  // The other half of the same question. "I'm going" is future tense and now
  // holds only what is ahead, so what a member has already been to needs a door
  // of its own, and this is where the rest of what the club knows about them
  // already lives.
  const beenTo = [...viewer.rsvps.entries()].filter(([eventId, status]) => {
    if (status !== 'going') return false;
    const startTime = viewer.startTimes.get(eventId);
    return startTime !== undefined && isPastStartTime(startTime);
  }).length;

  useEffect(() => {
    void loadAnswers().then((result) => {
      if (result.ok) setPercent(progressOf(result.answers).percent);
    });
    void loadDetails().then((result) => {
      if (result.ok) {
        setMissing(missingDetails(result.details));
        setShowInBrowse(result.details.showInBrowse);
      }
    });
  }, []);

  function leave() {
    setBusy(true);
    setError(null);
    // No navigation here: useAccount is subscribed to auth changes, so the
    // shell's guard notices and sends us to the welcome screen on its own.
    signOut()
      .then((result) => {
        if (!result.ok) setError(result.error ?? 'Could not sign out.');
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Could not sign out.');
      })
      .finally(() => {
        setBusy(false);
      });
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {member ? (
        <MeHero member={member} />
      ) : (
        <header className="flex-none border-line border-b bg-paper px-[18px] pt-[18px] pb-3">
          <h1 className="font-extrabold font-head text-[1.5625rem] text-ink tracking-[-0.02em]">
            Me
          </h1>
          <p className="mt-0.5 text-[0.78125rem] text-grey">Signed in as {displayName ?? '—'}</p>
        </header>
      )}

      <div className="mx-auto w-full max-w-[var(--events-measure)] px-4 py-4">
        <MeStats going={going} interested={interested} beenTo={beenTo} />

        {/* Two columns on a wide screen. Each card stands alone, so reading
            order across columns costs nothing and the page stops being a
            single long reach to the bottom. */}
        <div className="lg:grid lg:grid-cols-2 lg:gap-x-5">
          <div>
            <SectionHeading>Your profile</SectionHeading>
            <Link
              to="/profile"
              className="flex items-center gap-3.5 rounded-[17px] border border-line bg-paper p-3.5"
            >
              <ProgressRing percent={percent ?? 0} />
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold font-head text-[0.96875rem] text-ink">
                  {percent === 100 ? 'Profile complete' : 'Complete your profile'}
                </span>
                <span className="mt-0.5 block text-[0.78125rem] text-ink2 leading-[1.45]">
                  {percent === 100
                    ? 'You are searchable on every field members filter by.'
                    : 'The more of it you fill in, the better the club can put you next to the right people.'}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 flex-none text-grey" />
            </Link>

            <Link
              to="/profile/details"
              className="mt-2.5 flex items-center gap-3.5 rounded-[17px] border border-line bg-paper p-3.5"
            >
              {/* A count, because onboarding can now be finished after the
                  birthday — so an empty photo or city is the ordinary state
                  for a while rather than an oversight, and the number is how
                  somebody knows there is anything to come back for. It names
                  what is missing underneath rather than only counting: a
                  badge saying 3 with nothing to act on is a nag. */}
              {missing.length > 0 ? (
                <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full bg-gold font-extrabold font-head text-[0.9375rem] text-[#2A1E06]">
                  {missing.length}
                </span>
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold font-head text-[0.96875rem] text-ink">
                  Your details
                </span>
                <span className="mt-0.5 block text-[0.78125rem] text-ink2 leading-[1.45]">
                  {missing.length > 0
                    ? `Still to add: ${listInWords(missing)}.`
                    : 'Name, photo, birthday, injury and where you live — fix anything onboarding got wrong.'}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 flex-none text-grey" />
            </Link>

            {/* The card itself, as the deck draws it.
             *
             * The survey exists to shape what other members see, and until now
             * the only feedback on it was a percentage. A ring saying 62% does
             * not tell you that your photograph crops badly or that the one
             * topic you offered reads oddly next to your name.
             *
             * Peers no longer lists you, which is what makes this worth having
             * rather than redundant: the page is otherwise unreachable from
             * inside the app. `/peers/:id` renders any member, your own row
             * included — browse_members still carries it, deliberately. */}
            {userId ? (
              <Link
                to={`/peers/${userId}`}
                state={{ from: 'me' }}
                className="mt-2.5 flex items-center gap-3.5 rounded-[17px] border border-line bg-paper p-3.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold font-head text-[0.96875rem] text-ink">
                    How you look to other members
                  </span>
                  <span className="mt-0.5 block text-[0.78125rem] text-ink2 leading-[1.45]">
                    Your profile exactly as the club sees it. You are not in your own deck, so this
                    is the only way to it.
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 flex-none text-grey" />
              </Link>
            ) : null}

            {/* Directly under "How you look to other members", which is the
                question it is the other half of: this is whether they look at
                all. */}
            {userId && showInBrowse !== null ? (
              <DeckVisibility
                userId={userId}
                showInBrowse={showInBrowse}
                onChange={setShowInBrowse}
              />
            ) : null}

            <SectionHeading>Standing</SectionHeading>
            <div className="rounded-[17px] border border-line bg-paper p-3.5">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-5 w-5 flex-none text-gold-dp" />
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold font-head text-[0.9375rem] text-ink">
                    Good standing
                  </span>
                  {invitedBy ? (
                    <span className="block text-[0.78125rem] text-grey">
                      Invited by {invitedBy}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="my-3 h-px bg-line" />
              {/* The mock links this to a house-rules page. There is no such
                  page, so the rule is stated here instead of behind a link that
                  goes nowhere — and CONTEXT.md asks that losing membership stay
                  visible in the product rather than buried in a terms page,
                  which an inline sentence does better than a link anyway. */}
              <p className="text-[0.78125rem] text-ink2 leading-[1.55]">
                Membership can be lost. Selling to members, harassing anyone, giving medical advice
                as fact, or repeating outside a room what was said in it all end it.
              </p>
            </div>
          </div>

          <div>
            <SectionHeading>Invites</SectionHeading>
            <div className="rounded-[17px] border border-line bg-paper p-3.5">
              <div className="flex items-start gap-2.5">
                <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[11px] bg-tint text-navy">
                  <Mail className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold font-head text-[0.9375rem] text-ink">
                    {member?.type === 'mentor' ? 'You can invite people' : 'Members cannot invite'}
                  </span>
                  <span className="mt-0.5 block text-[0.78125rem] text-ink2 leading-[1.45]">
                    {member?.type === 'mentor'
                      ? "As a mentor you can put two numbers on the club's list. They join by verifying that number."
                      : "Only a member organization or a peer mentor can put a number on the club's list. It is what keeps the club closed."}
                  </span>
                </span>
              </div>

              {/* The card stated the allowance and then offered no way to
                  spend it — /admin was the only invite surface and an
                  ordinary mentor cannot reach it. */}
              {member?.type === 'mentor' ? (
                <Link
                  to="/invites"
                  className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-1 rounded-[11px] border-[1.6px] border-navy font-bold font-head text-[0.875rem] text-navy"
                >
                  Your invites
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : null}
            </div>

            {/* Its own heading. It sat directly under the Invites card with
                nothing between them, so the club's admin tools read as part of
                a section about who may invite whom. */}
            {isAdmin ? (
              <>
                <SectionHeading>Club tools</SectionHeading>
                <Link
                  to="/admin"
                  className="flex min-h-[48px] w-full items-center justify-center rounded-[13px] border-[1.6px] border-navy font-bold font-head text-[0.9375rem] text-navy"
                >
                  Admin
                </Link>
              </>
            ) : null}

            {/* Above sign-out deliberately: somebody who cannot read the screen
                needs to find this, and the last thing on the page is the
                hardest thing to reach with a head pointer or a mouth stick. */}
            <AccessibilitySettings />
          </div>
        </div>

        {error ? (
          <p className="mt-4 text-[0.8125rem] text-destructive leading-[1.45]">{error}</p>
        ) : null}

        <button
          type="button"
          onClick={leave}
          disabled={busy}
          className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] bg-tint font-bold font-head text-[0.9375rem] text-navy disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" />
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
        <p className="mt-2 text-center text-[0.75rem] text-grey leading-[1.45]">
          Your profile stays. Signing back in needs a code sent to your number.
        </p>
      </div>
    </div>
  );
}
