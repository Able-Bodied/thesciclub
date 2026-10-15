import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GoogleButton } from '@/components/google-button';
import { describeError } from '@/lib/describe-error';
import { googleGoesToBrowser, PAIRING_PARAM } from '@/lib/google-in-browser';
import { GOOGLE_NOT_SIGNED_IN, signInWithGoogleToken } from '@/lib/google-sign-in';
import { getSupabase } from '@/lib/supabase';
import { LinkButton, PrimaryButton, Question, StepFrame, Sub } from '@/routes/onboarding/chrome';

/**
 * Chrome or Safari, opened by the iPhone Home Screen app to sign in with
 * Google there (src/lib/google-in-browser.ts, migration 20261015010000).
 *
 * The member picks their Google account, then confirms, and this browser
 * leaves a sign-in for the app that sent them. Already signed in here, it
 * goes straight to the confirmation.
 *
 * The confirmation is the one thing between a member and a link somebody else
 * made, which would hand the member's sign-in to that person's app. So it says
 * plainly when to go on, and it is never skipped. Whether the account may get
 * in is not decided here: the app's own doors decide, as for any sign-in.
 */

type Phase = 'loading' | 'signed-out' | 'confirm' | 'done' | 'refused';

const PAIRING = /^[0-9a-f]{64}$/;

export default function AppSignInPage() {
  const [params] = useSearchParams();
  const pairing = params.get(PAIRING_PARAM) ?? '';
  const [phase, setPhase] = useState<Phase>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    let cancelled = false;
    function show(session: { user: { email?: string | undefined } } | null) {
      if (cancelled) return;
      setEmail(session?.user.email ?? null);
      setPhase((p) => (p === 'done' || p === 'refused' ? p : session ? 'confirm' : 'signed-out'));
    }
    void supabase.auth.getSession().then(({ data }) => {
      show(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      show(session);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signInWithToken(token: string, nonce: string) {
    setBusy(true);
    setError(null);
    const result = await signInWithGoogleToken(token, nonce).catch(() => ({
      ok: false as const,
      error: GOOGLE_NOT_SIGNED_IN,
    }));
    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  async function googlePage() {
    setBusy(true);
    setError(null);
    const back = new URL(window.location.pathname, window.location.origin);
    back.searchParams.set(PAIRING_PARAM, pairing);
    const { error: failure } = await getSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: back.href },
    });
    if (failure) {
      setBusy(false);
      setError(describeError(failure, 'Could not reach Google.'));
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    // Taken whole: rpc() types its payload as `any`.
    const paired = await getSupabase().rpc('pair_home_screen_app', { pairing });
    const filled: unknown = paired.data;
    setBusy(false);
    if (paired.error) {
      setError(describeError(paired.error, 'The app was not signed in. Try again.'));
      return;
    }
    setPhase(filled === true ? 'done' : 'refused');
  }

  async function otherAccount() {
    setBusy(true);
    setError(null);
    // This browser only: the member's other phones and the app stay as they are.
    await getSupabase().auth.signOut({ scope: 'local' });
    setBusy(false);
  }

  if (googleGoesToBrowser()) {
    return (
      <Message title="Open this in Chrome or Safari">
        This page signs in the SCI Club app from a browser. In the app, tap Sign in with Google
        again.
      </Message>
    );
  }
  if (!PAIRING.test(pairing) || phase === 'refused') {
    return (
      <Message title="This sign-in cannot be used">
        Go back to the SCI Club app and tap Sign in with Google again.
      </Message>
    );
  }
  if (phase === 'done') {
    return (
      <Message title="Now go back to the app">
        The SCI Club app on this phone is signing you in. Swipe up from the bottom of the screen and
        choose The SCI Club, or tap its icon on your Home Screen. You can close this page.
      </Message>
    );
  }
  if (phase === 'loading') {
    return (
      <main className="grid h-dvh place-items-center bg-canvas">
        <Loader2 className="h-5 w-5 animate-spin text-grey" aria-label="Loading" />
      </main>
    );
  }

  const failure = error ? (
    <p role="alert" className="mb-2.5 text-[0.8125rem] text-destructive leading-[1.45]">
      {error}
    </p>
  ) : null;

  if (phase === 'signed-out') {
    return (
      <StepFrame stepNumber={null} totalSteps={0} onSubmit={() => undefined} footer={failure}>
        <Question>Sign in to the SCI Club app</Question>
        <Sub>Choose your Google account. Then you will go back to the app.</Sub>
        <div className="mt-5">
          <GoogleButton
            text="signin_with"
            prompt
            disabled={busy}
            fallbackLabel="Sign in with Google"
            onToken={(token, nonce) => {
              void signInWithToken(token, nonce);
            }}
            onFallback={() => {
              void googlePage();
            }}
          />
        </div>
      </StepFrame>
    );
  }

  return (
    <StepFrame
      stepNumber={null}
      totalSteps={0}
      onSubmit={() => {
        void confirm();
      }}
      footer={
        <>
          {failure}
          <PrimaryButton disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
          </PrimaryButton>
          <LinkButton
            disabled={busy}
            onClick={() => {
              void otherAccount();
            }}
          >
            Use a different account
          </LinkButton>
        </>
      }
    >
      <Question>Sign in the app?</Question>
      <Sub>
        The SCI Club app on this phone will be signed in as{' '}
        <span className="font-bold text-ink">{email ?? 'this account'}</span>.
      </Sub>
      <p className="mt-4 text-[0.84375rem] text-ink2 leading-[1.5]">
        Only continue if you just tapped Sign in with Google in the SCI Club app on this phone. If
        somebody sent you this link, close this page.
      </p>
    </StepFrame>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-canvas px-[18px] pt-12">
      <h1 className="font-extrabold font-display text-[1.5625rem] text-ink leading-tight tracking-[-0.01em]">
        {title}
      </h1>
      <p className="mt-2.5 text-[0.8875rem] text-ink2 leading-[1.52]">{children}</p>
    </main>
  );
}
