import { ChevronRight, LogOut, Mail } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { signOut, useAccount } from '@/lib/account';
import { describeThrown } from '@/lib/describe-error';
import { useViewerEvents } from '@/lib/events';
import { useOwnMember } from '@/lib/members';
import { isPastStartTime } from '@/routes/events/filters';
import { MENTOR_ALLOWANCE } from '@/routes/invites/mentor-invites';
import { AccessibilitySettings } from '@/routes/me/accessibility-settings';
import { DeckVisibility } from '@/routes/me/deck-visibility';
import { MeHero } from '@/routes/me/hero';
import { StandingCard } from '@/routes/me/standing';
import { loadMyStrikes, type MyStrike } from '@/routes/me/standing-api';
import { MeStats } from '@/routes/me/stats';
import {
  detailsPercent,
  listInWords,
  loadDetails,
  missingDetails,
} from '@/routes/profile/details-api';
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
  // r and the stroke decide how much room is left *inside* the ring, which is
  // the number the label has to fit — not the width of the box. A thinner
  // stroke at a wider radius buys that room without a bigger circle.
  const radius = 19;
  const circumference = 2 * Math.PI * radius;
  return (
    // Sized in `em` off its own label, so the circle grows with the number
    // inside it — and sized against the *interior* of the circle rather than
    // the box around it, which is the mistake that left this broken after it
    // was called fixed. At 3.85em the box was 46px and the label "100%" was
    // 36px, so it "fitted"; but r=18 with a 4-unit stroke leaves 34px of
    // interior, and 36 into 34 does not go. It clipped to "00%" at every text
    // size, for the one member who had finished their profile.
    //
    // 4.7em with a thinner stroke leaves ~42px of interior against a 36px
    // label. Measured, not eyeballed, at both text sizes.
    <span className="relative grid h-[4.7em] w-[4.7em] flex-none place-items-center text-[0.75rem]">
      <svg
        viewBox="0 0 44 44"
        className="-rotate-90 absolute h-[4.7em] w-[4.7em]"
        aria-hidden="true"
      >
        <circle cx="22" cy="22" r={radius} fill="none" stroke="var(--tint)" strokeWidth="3.4" />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke="var(--navy)"
          strokeWidth="3.4"
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
  // Null until the details load, so the badge does not flash 0% at somebody
  // whose profile is finished.
  const [detailsDone, setDetailsDone] = useState<number | null>(null);
  // Null until the details load, so the switch is not drawn in the wrong
  // position for a moment and then corrected under the reader's eye.
  const [showInBrowse, setShowInBrowse] = useState<boolean | null>(null);
  // Null until they arrive, so the card does not say "Good standing" for a
  // moment to somebody who is on two and then correct itself.
  const [strikes, setStrikes] = useState<MyStrike[] | null>(null);

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
      // With the declines, so "rather not say" counts towards the ring the way
      // an answer does. Without them somebody who has decided is shown an
      // unfinished profile for ever — see 20260917030000.
      if (result.ok) setPercent(progressOf(result.answers, result.declined).percent);
    });
    if (userId) {
      void loadMyStrikes(userId).then((result) => {
        if (result.ok) setStrikes(result.strikes);
      });
    }
    void loadDetails().then((result) => {
      if (result.ok) {
        setMissing(missingDetails(result.details));
        setDetailsDone(detailsPercent(result.details));
        setShowInBrowse(result.details.showInBrowse);
      }
    });
  }, [userId]);

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
        setError(describeThrown(e, 'Could not sign out.'));
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
              {/* Gone once it is finished, at the owner's request, and it is
                  the right thing to do: a ring at 100% is a progress indicator
                  for a thing with no progress left to make, and the sentence
                  beside it already says so in words. Nothing replaces it —
                  not a tick, not a full circle — because the card is then a
                  statement and a way in, which is what the row below it has
                  always been.

                  Nothing is drawn while it loads either, rather than a ring at
                  0%. The card has two legitimate heights anyway now, so there
                  is nothing to be gained by holding the space with a number
                  that is briefly false. */}
              {percent !== null && percent < 100 ? <ProgressRing percent={percent} /> : null}
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold font-head text-[0.96875rem] text-ink">
                  {percent === 100 ? 'Profile complete' : 'Complete your profile'}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 flex-none text-grey" />
            </Link>

            <Link
              to="/profile/details"
              className="mt-2.5 flex items-center gap-3.5 rounded-[17px] border border-line bg-paper p-3.5"
            >
              {/* The same ring as the survey card above, at the owner's
                  request, and it earns its place here for the same reason a
                  count did not: a count answered "how much is missing", which
                  is a question about the form, where a percentage answers "how
                  far along am I", which is the question somebody has.

                  Two cards, one treatment, one rule: the ring is progress, so
                  it is gone once there is no progress left to make. Before
                  this, these two rows disagreed about what "finished" looked
                  like — the survey card lost its ring and the details card kept
                  a badge — which made the pair read as two different kinds of
                  thing rather than as the same question asked twice. */}
              {detailsDone !== null && detailsDone < 100 ? (
                <ProgressRing percent={detailsDone} />
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold font-head text-[0.96875rem] text-ink">
                  Your details
                </span>
                {/* The one line left under a card in this section, and it is
                    not an explanation — it is the list of what is actually
                    missing, which is the only thing here somebody can act on.
                    It goes when there is nothing left to name, so a finished
                    card is a name and a chevron like the rest.

                    The heading stays "Your details" at every value, unlike the
                    survey card, which turns "Complete your profile" into
                    "Profile complete". That one is a call to action becoming a
                    statement; this one is the name of the page it opens. */}
                {missing.length > 0 ? (
                  <span className="mt-0.5 block text-[0.78125rem] text-ink2 leading-[1.45]">
                    Still to add: {listInWords(missing)}.
                  </span>
                ) : null}
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
                    My profile view
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 flex-none text-grey" />
              </Link>
            ) : null}

            {/* Directly under "My profile view", which is the question it is
                the other half of: that one is how you look to other members,
                this one is whether they can look at all. */}
            {userId && showInBrowse !== null ? (
              <DeckVisibility
                userId={userId}
                showInBrowse={showInBrowse}
                onChange={setShowInBrowse}
              />
            ) : null}

            <SectionHeading>Standing</SectionHeading>
            <StandingCard invitedBy={invitedBy} strikes={strikes} />
          </div>

          <div>
            {/* Mentors only, at the owner's request, and the reasoning
                generalises: do not give a member a card about something they
                cannot do.
             *
             * This one used to render for everybody in two variants — "You can
             * invite people" with a way in, or "Members cannot invite" with a
             * paragraph explaining the rule. The second was a section heading,
             * a bordered card and an icon spent on telling most of the club
             * about a thing that was never going to happen to them, on the one
             * screen that is supposed to be about them.
             *
             * Note what is *not* being removed by the same argument. Home and
             * Chat still say plainly that they are not built, and the official
             * account still says messaging does not exist. Those are different:
             * a member looking for a feature that is coming needs to find out
             * where it stands, and silence there reads as a broken app rather
             * than as a deferred one. The rule is about permission, not about
             * absence — see CONTEXT.md, which defers both deliberately. */}
            {member?.type === 'mentor' ? (
              <>
                <SectionHeading>Invites</SectionHeading>
                <div className="rounded-[17px] border border-line bg-paper p-3.5">
                  <div className="flex items-start gap-2.5">
                    <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[11px] bg-tint text-navy">
                      <Mail className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-extrabold font-head text-[0.9375rem] text-ink">
                        You can invite people
                      </span>
                      <span className="mt-0.5 block text-[0.78125rem] text-ink2 leading-[1.45]">
                        As a mentor you can put {MENTOR_ALLOWANCE} numbers on the club's list.
                      </span>
                    </span>
                  </div>

                  {/* The card stated the allowance and then offered no way to
                      spend it — /admin was the only invite surface and an
                      ordinary mentor cannot reach it. */}
                  <Link
                    to="/invites"
                    className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-1 rounded-[11px] border-[1.6px] border-navy font-bold font-head text-[0.875rem] text-navy"
                  >
                    Your invites
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </>
            ) : null}

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
      </div>
    </div>
  );
}
