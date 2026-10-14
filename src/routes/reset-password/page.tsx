import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MIN_PASSWORD } from '@/lib/auth-email';
import { describeError } from '@/lib/describe-error';
import { forgetRecoveryLink, recoveryLinkWorked } from '@/lib/recovery-link';
import { getSupabase } from '@/lib/supabase';
import { Field, PrimaryButton, Question, StepFrame, Sub } from '@/routes/onboarding/chrome';

/**
 * Choosing a new password, from the link in a "reset your password" email.
 *
 * Forgot password and Me's "Email me a link" both land here. The form is shown
 * only when this visit's link worked (recovery-link.ts), never because
 * somebody is signed in: a used or hour-old link is refused by Supabase but
 * leaves an existing session in place, and that session used to be enough to
 * reach the form (the owner, 2026-10-14). Anything else says the link no
 * longer works and where to ask for another.
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<'loading' | 'yes' | 'no'>('loading');
  const [signedIn, setSignedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    let cancelled = false;
    // getSession waits for the client to finish reading the address, so the
    // link has been judged by the time it answers.
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSignedIn(data.session !== null);
      setSession(data.session && recoveryLinkWorked() ? 'yes' : 'no');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!cancelled && event === 'PASSWORD_RECOVERY' && next) setSession('yes');
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const mismatch = again !== '' && password !== again;
  const ready = password.length >= MIN_PASSWORD && password === again;

  async function save() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const { error: failure } = await getSupabase().auth.updateUser({ password });
    setBusy(false);
    if (failure) {
      setError(describeError(failure, 'Your password was not changed. Try again.'));
      return;
    }
    forgetRecoveryLink();
    // A non-member is sent on to /join by the guard at Home.
    void navigate('/home', { replace: true });
  }

  if (session === 'loading') {
    return (
      <main className="grid h-dvh place-items-center bg-canvas">
        <Loader2 className="h-5 w-5 animate-spin text-grey" aria-label="Loading" />
      </main>
    );
  }

  if (session === 'no') {
    return (
      <main className="mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-canvas px-[18px] pt-12">
        <h1 className="font-extrabold font-display text-[1.5625rem] text-ink leading-tight tracking-[-0.01em]">
          This link no longer works
        </h1>
        <p className="mt-2.5 text-[0.8875rem] text-ink2 leading-[1.52]">
          A reset link works once, within an hour of being sent.{' '}
          {signedIn
            ? 'Ask for a new one under Account, with Email me a link.'
            : 'Ask for a new one from the sign-in screen with Forgot password.'}
        </p>
        <Link
          to={signedIn ? '/me?tab=account' : '/join'}
          className="mt-6 flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-on-gold text-[0.9375rem]"
        >
          {signedIn ? 'Go to Account' : 'Go to sign in'}
        </Link>
      </main>
    );
  }

  return (
    <StepFrame
      stepNumber={null}
      totalSteps={0}
      onSubmit={() => {
        void save();
      }}
      footer={
        <>
          {error ? (
            <p role="alert" className="mb-2.5 text-[0.8125rem] text-destructive leading-[1.45]">
              {error}
            </p>
          ) : null}
          <PrimaryButton disabled={!ready || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save password'}
          </PrimaryButton>
        </>
      }
    >
      <Question>Choose a new password</Question>
      <Sub>At least {MIN_PASSWORD} characters.</Sub>
      <label htmlFor="new-password" className="mt-5 block font-bold text-[0.8125rem] text-ink">
        New password
      </label>
      <Field
        id="new-password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
        }}
      />
      <label htmlFor="again" className="mt-4 block font-bold text-[0.8125rem] text-ink">
        Type it again
      </label>
      <Field
        id="again"
        type="password"
        autoComplete="new-password"
        value={again}
        onChange={(e) => {
          setAgain(e.target.value);
        }}
      />
      {mismatch ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
          The two passwords do not match.
        </p>
      ) : null}
    </StepFrame>
  );
}
