import { ChevronRight, LogOut } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { signOut, useAccount } from '@/lib/account';
import { describeThrown } from '@/lib/describe-error';
import { useViewerEvents } from '@/lib/events';
import { useInvitePermissions } from '@/lib/invite-permissions';
import { useOwnMember } from '@/lib/members';
import { isPastStartTime } from '@/routes/events/filters';
import { MENTOR_ALLOWANCE } from '@/routes/invites/mentor-invites';
import { AccessibilitySettings } from '@/routes/me/accessibility-settings';
import { DeckVisibility } from '@/routes/me/deck-visibility';
import { DeleteAccount } from '@/routes/me/delete-account';
import { GoogleSignIn } from '@/routes/me/google-sign-in';
import { MeHero } from '@/routes/me/hero';
import { NotificationSettings } from '@/routes/me/notification-settings';
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

/** Me keeps profile editing, club participation and account settings together
 * by purpose. Settings stay expanded so display controls are easy to reach. */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 font-extrabold font-head text-[1rem] text-ink">{children}</h2>;
}

function ProfileLink({
  to,
  title,
  description,
  percent,
  state,
}: {
  to: string;
  title: string;
  description?: string;
  percent?: number | null;
  state?: { from: string };
}) {
  const descriptionId = useId();
  return (
    <Link
      aria-label={title}
      aria-describedby={description ? descriptionId : undefined}
      to={to}
      state={state}
      className="flex min-h-[64px] items-center gap-3 rounded-[14px] border border-line bg-paper p-3.5 transition-colors hover:bg-tint"
    >
      {percent !== undefined && percent !== null && percent < 100 ? (
        <ProgressRing percent={percent} />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block font-extrabold font-head text-[0.96875rem] text-ink">{title}</span>
        {description ? (
          <span id={descriptionId} className="mt-1 block text-[0.8125rem] text-ink2 leading-[1.5]">
            {description}
          </span>
        ) : null}
      </span>
      <ChevronRight aria-hidden="true" className="h-5 w-5 flex-none text-emphasis" />
    </Link>
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
          stroke="var(--emphasis)"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent / 100)}
        />
      </svg>
      <span className="relative font-extrabold font-head text-emphasis">{percent}%</span>
    </span>
  );
}

export default function MePage() {
  const { userId, displayName, isAdmin } = useAccount();
  const { member, invitedBy } = useOwnMember(userId);
  const invitePermissions = useInvitePermissions(userId);
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
          <h1 className="font-extrabold font-display text-[1.5625rem] text-ink tracking-[-0.01em]">
            Me
          </h1>
          <p className="mt-0.5 text-[0.78125rem] text-grey">Signed in as {displayName ?? '—'}</p>
        </header>
      )}

      <div className="mx-auto w-full max-w-[var(--events-measure)] px-4 py-5">
        <nav aria-label="On this page" className="mb-5 flex flex-wrap gap-2">
          {[
            ['me-profile', 'Your profile'],
            ...(isAdmin || member?.type === 'organization' || invitePermissions.canInvite
              ? [['me-club', 'Club tools']]
              : []),
            ['me-settings', 'Settings'],
            ['me-account', 'Account'],
          ].map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="flex min-h-[44px] items-center rounded-full border border-line bg-paper px-4 font-semibold text-[0.8125rem] text-emphasis hover:bg-tint"
            >
              {label}
            </a>
          ))}
        </nav>
        <MeStats going={going} interested={interested} beenTo={beenTo} />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
          <section id="me-profile" tabIndex={-1} className="min-w-0 scroll-mt-4">
            <SectionHeading>Your profile</SectionHeading>
            <div className="space-y-2.5">
              <ProfileLink
                to={percent ? '/profile/answers' : '/profile'}
                title={percent === 100 ? 'Profile complete' : 'Complete your profile'}
                description="Your interests, experience and what you want to share."
                percent={percent}
              />
              <ProfileLink
                to="/profile/details"
                title="Your details"
                description={
                  missing.length > 0
                    ? `Still to add: ${listInWords(missing)}.`
                    : 'Your name, photo, injury and location.'
                }
                percent={detailsDone}
              />
              {userId ? (
                <ProfileLink
                  to={`/peers/${userId}`}
                  state={{ from: 'me' }}
                  title="My profile view"
                  description="See how your profile looks to other members."
                />
              ) : null}
            </div>
            {userId && showInBrowse !== null ? (
              <DeckVisibility
                userId={userId}
                showInBrowse={showInBrowse}
                onChange={setShowInBrowse}
              />
            ) : null}
          </section>
          <div className="min-w-0 space-y-6">
            {isAdmin ||
            member?.type === 'organization' ||
            invitePermissions.canInvite ||
            invitePermissions.error ? (
              <section id="me-club" tabIndex={-1} className="scroll-mt-4">
                <SectionHeading>Club tools</SectionHeading>
                <div className="space-y-2.5">
                  {isAdmin ? (
                    <ProfileLink
                      to="/admin"
                      title="Admin"
                      description="Members, invites, organizations and moderation."
                    />
                  ) : null}
                  {member?.type === 'organization' ? (
                    <ProfileLink
                      to="/organizations/manage"
                      title="Manage your organizations"
                      description="Update the organizations linked to your account."
                    />
                  ) : null}
                  {invitePermissions.canInvite ? (
                    <div className="rounded-[14px] border border-line bg-paper p-3.5">
                      <h3 className="font-extrabold font-head text-[0.9375rem] text-ink">
                        You can invite people
                      </h3>
                      <p className="mt-1 text-[0.8125rem] text-ink2 leading-[1.5]">
                        {invitePermissions.unlimited
                          ? 'You can invite people without a limit.'
                          : `As a mentor you can put ${MENTOR_ALLOWANCE} numbers on the club’s list.`}
                      </p>
                      <Link
                        to="/invites"
                        className="mt-3 flex min-h-[44px] items-center justify-between gap-2 rounded-[11px] bg-tint px-3 font-bold font-head text-[0.875rem] text-emphasis"
                      >
                        Your invites
                        <ChevronRight aria-hidden="true" className="h-4 w-4" />
                      </Link>
                    </div>
                  ) : null}
                  {invitePermissions.error ? (
                    <div>
                      <p role="alert" className="text-destructive">
                        {invitePermissions.error}
                      </p>
                      <button
                        type="button"
                        className="min-h-[44px] text-emphasis underline"
                        onClick={invitePermissions.reload}
                      >
                        Retry invite permissions
                      </button>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
            <section>
              <SectionHeading>Standing</SectionHeading>
              <StandingCard invitedBy={invitedBy} strikes={strikes} />
            </section>
          </div>
        </div>
        <section
          id="me-settings"
          tabIndex={-1}
          className="mt-7 scroll-mt-4 border-line border-t pt-5"
        >
          <SectionHeading>Settings</SectionHeading>
          <p className="text-[0.8125rem] text-ink2">
            Make the club comfortable to use on this device.
          </p>
          <div className="grid items-start gap-x-6 lg:grid-cols-2">
            <AccessibilitySettings />
            <NotificationSettings
              userId={userId}
              isMentor={member?.type === 'mentor'}
              isAdmin={isAdmin}
            />
          </div>
        </section>
        <section
          id="me-account"
          tabIndex={-1}
          className="mt-7 scroll-mt-4 border-line border-t pt-5"
        >
          <SectionHeading>Account</SectionHeading>
          <GoogleSignIn />
          {error ? (
            <p role="alert" className="mt-4 text-[0.8125rem] text-destructive leading-[1.45]">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={leave}
            disabled={busy}
            className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] border border-line bg-paper font-bold font-head text-[0.9375rem] text-emphasis disabled:opacity-50"
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
          {userId ? <DeleteAccount userId={userId} isAdmin={isAdmin} /> : null}
        </section>
      </div>
    </div>
  );
}
