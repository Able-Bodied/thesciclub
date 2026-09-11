import { ChevronRight, LogOut, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { signOut, useAccount } from '@/lib/account';
import { AccessibilitySettings } from '@/routes/me/accessibility-settings';
import { loadAnswers } from '@/routes/profile/profile-api';
import { progressOf } from '@/routes/profile/questions';

/**
 * Me — your standing in the club, and the way out.
 *
 * Most of this tab is still to come with the profile survey. What is here now
 * is what somebody actually needs today: which account they are signed in as,
 * and how to leave it. Testing this app means switching between accounts
 * constantly, and without a way out the only route is clearing site data.
 */
/** A ring rather than a bar: it sits beside a line of text, not under one. */
function ProgressRing({ percent }: { percent: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  return (
    <span className="relative grid h-[46px] w-[46px] flex-none place-items-center">
      <svg viewBox="0 0 44 44" className="-rotate-90 absolute h-[46px] w-[46px]" aria-hidden="true">
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
      <span className="relative font-extrabold font-head text-[0.75rem] text-navy">{percent}%</span>
    </span>
  );
}

export default function MePage() {
  const { displayName, isAdmin } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);

  useEffect(() => {
    void loadAnswers().then((result) => {
      if (result.ok) setPercent(progressOf(result.answers).percent);
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
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-[18px] pb-3">
        <h1 className="font-extrabold font-head text-[1.5625rem] text-ink tracking-[-0.02em]">
          Me
        </h1>
      </header>

      <div className="mx-auto w-full max-w-[480px] px-4 py-4">
        <div className="rounded-[17px] border border-line bg-paper p-3.5">
          <p className="text-[0.78125rem] text-grey">Signed in as</p>
          <p className="mt-0.5 font-extrabold font-head text-[1.125rem] text-ink">
            {displayName ?? '—'}
          </p>
          {isAdmin ? (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gold-lt px-2.5 py-1 font-bold text-[0.6875rem] text-gold-dp uppercase tracking-wider">
              <ShieldCheck className="h-3 w-3" />
              Administrator
            </span>
          ) : null}
        </div>

        <Link
          to="/profile"
          className="mt-4 flex items-center gap-3.5 rounded-[17px] border border-line bg-paper p-3.5"
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
          <span className="min-w-0 flex-1">
            <span className="block font-extrabold font-head text-[0.96875rem] text-ink">
              Your details
            </span>
            <span className="mt-0.5 block text-[0.78125rem] text-ink2 leading-[1.45]">
              Name, photo, birthday, injury and where you live — fix anything onboarding got wrong.
            </span>
          </span>
          <ChevronRight className="h-5 w-5 flex-none text-grey" />
        </Link>

        {isAdmin ? (
          <Link
            to="/admin"
            className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-[13px] border-[1.6px] border-navy font-bold font-head text-[0.9375rem] text-navy"
          >
            Admin
          </Link>
        ) : null}

        {/* Above sign-out deliberately: somebody who cannot read the screen
            needs to find this, and the last thing on the page is the hardest
            thing to reach with a head pointer or a mouth stick. */}
        <AccessibilitySettings />

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
