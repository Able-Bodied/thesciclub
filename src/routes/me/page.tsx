import { ChevronRight, LogOut } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { InstallSettings } from '@/components/install-nudge';
import { type PageTab, PageTabs, TabPanel, useTabParam } from '@/components/page-tabs';
import { signOut, useAccount } from '@/lib/account';
import { describeThrown } from '@/lib/describe-error';
import { useViewerEvents } from '@/lib/events';
import { GOOGLE_RETURN_PARAM } from '@/lib/google-sign-in';
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

/**
 * Me in three tabs: Profile (what the club knows about you, what you can do in
 * it, and Sign out), Settings (this device), Account (how you sign in, and
 * deleting the account).
 *
 * One scroll held all three and ran past two and a half phone screens, so
 * Sign out and Display were found by scrolling past everything else. Most
 * members use the club on a phone, so each part is now one tap from the top.
 */
function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-3 font-extrabold font-head text-[1rem] text-ink">
      {children}
    </h2>
  );
}

const ME_TAB_VALUES = ['profile', 'settings', 'account'] as const;
type MeTab = (typeof ME_TAB_VALUES)[number];
const ME_TABS = [
  { value: 'profile', label: 'Profile' },
  { value: 'settings', label: 'Settings' },
  { value: 'account', label: 'Account' },
] as const satisfies readonly PageTab<MeTab>[];

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
  // Google sends a member back to /me?google=linked, and the answer is shown
  // where the button was. That parameter is not changed to add a tab: the
  // return address is on Supabase's allowed list, as written.
  const [params] = useSearchParams();
  const [initialTab] = useState<MeTab | undefined>(() =>
    params.has(GOOGLE_RETURN_PARAM) ? 'account' : undefined,
  );
  const [tab, setTab] = useTabParam(ME_TAB_VALUES, 'profile', initialTab);
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

  const hasClubTools =
    isAdmin ||
    member?.type === 'organization' ||
    invitePermissions.canInvite ||
    Boolean(invitePermissions.error);

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

      <PageTabs id="me" label="Me" fill tabs={ME_TABS} value={tab} onChange={setTab} />

      <div className="mx-auto w-full max-w-[var(--events-measure)] px-4 pt-5 pb-8">
        {tab === 'profile' ? (
          <TabPanel id="me" value="profile">
            <MeStats going={going} interested={interested} beenTo={beenTo} />
            <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
              <section aria-labelledby="me-profile-heading" className="min-w-0">
                <SectionHeading id="me-profile-heading">Your profile</SectionHeading>
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
                {hasClubTools ? (
                  <section aria-labelledby="me-club-heading">
                    <SectionHeading id="me-club-heading">Club tools</SectionHeading>
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
                        <ProfileLink
                          to="/invites"
                          title="Your invites"
                          description={
                            invitePermissions.unlimited
                              ? 'You can invite people without a limit.'
                              : `As a mentor you can put ${MENTOR_ALLOWANCE} numbers on the club’s list.`
                          }
                        />
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
                <section aria-labelledby="me-standing-heading">
                  <SectionHeading id="me-standing-heading">Standing</SectionHeading>
                  <StandingCard invitedBy={invitedBy} strikes={strikes} />
                </section>
              </div>
            </div>
            {/* On the tab Me opens on, at the owner's word: signing out is
                done in a hurry, on a shared or borrowed phone, and should not
                wait on finding the right tab. Deleting stays on Account. */}
            {error ? (
              <p role="alert" className="mt-6 text-[0.8125rem] text-destructive leading-[1.45]">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={leave}
              disabled={busy}
              className="mt-6 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] border border-line bg-paper font-bold font-head text-[0.9375rem] text-emphasis disabled:opacity-50 lg:mx-auto lg:max-w-[22rem]"
            >
              <LogOut aria-hidden="true" className="h-4 w-4" />
              {busy ? 'Signing out…' : 'Sign out'}
            </button>
          </TabPanel>
        ) : null}

        {tab === 'settings' ? (
          <TabPanel id="me" value="settings">
            <p className="text-[0.875rem] text-ink2 leading-[1.5]">
              These apply to this phone or computer only.
            </p>
            {/* Display first and always open: it is what somebody who finds
                the club hard to read comes here for. */}
            <div className="grid items-start gap-x-6 lg:grid-cols-2 [&>section:first-child]:mt-4 lg:[&>section]:mt-4">
              <AccessibilitySettings />
              <NotificationSettings
                userId={userId}
                isMentor={member?.type === 'mentor'}
                isAdmin={isAdmin}
              />
              <InstallSettings />
            </div>
          </TabPanel>
        ) : null}

        {tab === 'account' ? (
          <TabPanel id="me" value="account" className="max-w-[560px]">
            <p className="text-[0.875rem] text-ink2 leading-[1.5]">
              Signed in as {member?.displayName ?? displayName ?? '—'}.
            </p>
            {/* Kept mounted on this tab alone, which is why Google's return
                opens Me here: see `initialTab`. */}
            <GoogleSignIn />
            <section
              aria-labelledby="me-leaving-heading"
              // DeleteAccount brings its own top margin, sized for following
              // a button; under this heading it only needs a line's gap.
              className="mt-6 [&>:not(h2)]:mt-2.5"
            >
              <h2
                id="me-leaving-heading"
                className="font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]"
              >
                Deleting your account
              </h2>
              {userId ? <DeleteAccount userId={userId} isAdmin={isAdmin} /> : null}
            </section>
          </TabPanel>
        ) : null}
      </div>
    </div>
  );
}
