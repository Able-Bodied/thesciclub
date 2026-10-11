import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AccountProblem } from '@/components/account-problem';
import { signOut, useAccount } from '@/lib/account';
import { APPLE_RETURN_PARAM, signInWithApple } from '@/lib/apple-sign-in';
import {
  CONFIRMED_PARAM,
  cleanEmail,
  looksLikeEmail,
  MIN_PASSWORD,
  resendConfirmation,
  sendPasswordReset,
  signInWithEmail,
  signUpWithEmail,
} from '@/lib/auth-email';
import { describeError } from '@/lib/describe-error';
import { GOOGLE_RETURN_PARAM, signInWithGoogle, signInWithGoogleToken } from '@/lib/google-sign-in';
import {
  captureInviteToken,
  claimHeldInvite,
  forgetInviteToken,
  heldInviteToken,
  INVITE_PARAM,
} from '@/lib/invite-token';
import { passkeysAvailable, registerPasskey, signInWithPasskey } from '@/lib/passkeys';
import { vapidPublicKey } from '@/lib/push/notifications';
import { signInDestination } from '@/lib/sign-in-destination';
import { getSupabase } from '@/lib/supabase';
import { BlockedScreen } from '@/routes/onboarding/blocked';
import { LinkButton, PrimaryButton, Question, StepFrame, Sub } from '@/routes/onboarding/chrome';
import { NotificationsStep } from '@/routes/onboarding/notifications-step';
import { nameFromMetadata } from '@/routes/onboarding/prefill';
import {
  CheckEmailStep,
  ForgotStep,
  JoinStep,
  PasskeyOffer,
  SignInStep,
} from '@/routes/onboarding/sign-in-steps';
import {
  AgreeStep,
  BirthdayStep,
  CityStep,
  InjuryStep,
  NameStep,
  PhoneForEventsStep,
  PhotoStep,
  UsernameStep,
} from '@/routes/onboarding/steps';
import { submitOnboarding } from '@/routes/onboarding/submit-onboarding';
import {
  COUNTED_STEPS,
  canAdvance,
  cityStepDeclined,
  INITIAL_ONBOARDING_DATA,
  injuryStepDeclined,
  type OnboardingData,
  type Step,
  stepNumber,
  withCityDeclined,
  withInjuryDeclined,
} from '@/routes/onboarding/types';
import { WelcomeScreen } from '@/routes/onboarding/welcome';

/**
 * Joining the club, and signing back in.
 *
 * The order is the security decision in this file. Nobody is told whether an
 * address is on the list until they have *proved* it is theirs: a check that
 * anybody can run against any address would disclose who has a spinal cord
 * injury. So whichever way in someone takes (email and password, once the
 * emailed link has confirmed it; Google; Apple; a passkey) they come out the
 * other side as a signed-in account, and only then does `afterSignIn` ask the
 * database whether that account is invited (my_invite_status) — after first
 * claiming the invite their emailed link carried (claim_invite), if it did.
 *
 * Leftover accounts are allowed: an uninvited address can make an account.
 * That is the cost of never saying, at sign-up, who is invited.
 */

/** `notifications` and `passkey` are after the profile is saved, before Home. */
type Phase = 'wizard' | 'blocked' | 'submitting' | 'notifications' | 'passkey';

/** Where the invite check is run from: the doors, before anybody is through. */
const DOORS: Step[] = ['welcome', 'signin', 'forgot', 'join', 'check-email'];

const RESEND_WAIT = 60;

export default function OnboardingPage() {
  const navigate = useNavigate();
  const account = useAccount();
  const [step, setStep] = useState<Step>('welcome');
  const [phase, setPhase] = useState<Phase>('wizard');
  const [data, setData] = useState<OnboardingData>(INITIAL_ONBOARDING_DATA);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [forgotSent, setForgotSent] = useState(false);
  const [resendLeft, setResendLeft] = useState(0);
  const [blockedEmail, setBlockedEmail] = useState<string | null>(null);

  const set = useCallback((patch: Partial<OnboardingData>) => {
    setData((d) => ({ ...d, ...patch }));
  }, []);

  const [params, setParams] = useSearchParams();
  const destination = signInDestination(params.toString());

  // The invite link's token has to outlive this page (a confirmation email or
  // Google's round trip comes first), so it is kept the moment /join loads.
  const [invited] = useState(() => captureInviteToken(params.toString()) !== null);
  useEffect(() => {
    if (!params.has(INVITE_PARAM)) return;
    setParams(
      (p) => {
        p.delete(INVITE_PARAM);
        return p;
      },
      { replace: true },
    );
  }, [params, setParams]);

  // Somebody with a profile has no use for a held invite.
  useEffect(() => {
    if (account.status === 'member' || account.status === 'suspended') forgetInviteToken();
  }, [account.status]);

  /**
   * Back from a round trip without getting in: Cancel at Google or Apple, or an
   * emailed link that has expired. Once, on the first answer about the account.
   */
  const handledReturn = useRef(false);
  useEffect(() => {
    if (handledReturn.current || account.status === 'loading') return;
    handledReturn.current = true;
    if (account.status !== 'signed-out') return;
    const google = params.get(GOOGLE_RETURN_PARAM) === 'signin';
    const apple = params.get(APPLE_RETURN_PARAM) === 'signin';
    const confirmed = params.get(CONFIRMED_PARAM) === '1';
    const expired = window.location.hash.includes('error_code=');
    if (!google && !apple && !confirmed && !expired) return;
    setStep('signin');
    if (expired)
      setError('That link has expired or was already used. Sign in, or ask for a new one.');
    else if (google) setError('Google did not sign you in. Try again, or use your email.');
    else if (apple) setError('Apple did not sign you in. Try again, or use your email.');
    else setNotice('Your email is confirmed. Sign in to go on.');
    setParams(
      (p) => {
        for (const key of [GOOGLE_RETURN_PARAM, APPLE_RETURN_PARAM, CONFIRMED_PARAM]) p.delete(key);
        return p;
      },
      { replace: true },
    );
  }, [account.status, params, setParams]);

  /**
   * Signed in, with no member row: claim the invite the link carried, then ask
   * whether this account is invited. Run on each sign-in while the doors are
   * showing, whichever way it happened.
   */
  const afterSignIn = useCallback(async () => {
    setError(null);
    setNotice(null);
    const supabase = getSupabase();
    const claim = await claimHeldInvite();
    if (claim === 'failed') {
      setError('Could not check your invitation. Try again.');
      return;
    }
    const statusResult = await supabase.rpc('my_invite_status').single();
    if (statusResult.error) {
      setError(describeError(statusResult.error, 'Could not check whether you are on the list.'));
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!(statusResult.data as { invited: boolean }).invited) {
      setBlockedEmail(user?.email ?? null);
      setPhase('blocked');
      return;
    }
    // The name Google or Apple gave, only into an empty box.
    const given = nameFromMetadata(user?.user_metadata);
    setData((d) => ({ ...d, displayName: d.displayName.trim() ? d.displayName : given }));
    setStep(data.termsAgreed ? 'name' : 'agree');
  }, [data.termsAgreed]);

  const gateRan = useRef(false);
  useEffect(() => {
    if (account.status !== 'signed-up') {
      gateRan.current = false;
      return;
    }
    if (phase !== 'wizard' || !DOORS.includes(step) || gateRan.current) return;
    gateRan.current = true;
    setStep('checking');
    void afterSignIn();
  }, [account.status, phase, step, afterSignIn]);

  // The wait before the confirmation link can be asked for again.
  useEffect(() => {
    if (resendLeft <= 0) return;
    const timer = window.setTimeout(() => {
      setResendLeft((n) => n - 1);
    }, 1000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [resendLeft]);

  /** Google's widget picked an account; a session follows and the gate takes over. */
  async function signInWithToken(token: string, nonce: string) {
    setBusy(true);
    setError(null);
    const result = await signInWithGoogleToken(token, nonce).catch(() => ({
      ok: false as const,
      error: 'Google did not sign you in.',
    }));
    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  async function continueWithGoogle() {
    setBusy(true);
    setError(null);
    const result = await signInWithGoogle();
    // On success the page is already on its way to Google.
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
    }
  }

  async function continueWithApple() {
    setBusy(true);
    setError(null);
    const result = await signInWithApple();
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
    }
  }

  async function continueWithPasskey() {
    setBusy(true);
    setError(null);
    const result = await signInWithPasskey();
    setBusy(false);
    if (!result.ok && result.error) setError(result.error);
  }

  const ways = {
    busy,
    onGoogleToken: (token: string, nonce: string) => {
      void signInWithToken(token, nonce);
    },
    onGoogleRedirect: () => {
      void continueWithGoogle();
    },
    onApple: () => {
      void continueWithApple();
    },
    onPasskey: () => {
      void continueWithPasskey();
    },
  };

  async function submitSignIn() {
    setBusy(true);
    setError(null);
    const result = await signInWithEmail(data.email, data.password);
    setBusy(false);
    if (result.ok) {
      set({ password: '' });
      return;
    }
    if (result.unconfirmed) {
      setStep('check-email');
      setNotice(result.error);
      return;
    }
    setError(result.error);
  }

  async function submitJoin() {
    setBusy(true);
    setError(null);
    const result = await signUpWithEmail(data.email, data.password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    set({ password: '' });
    setResendLeft(RESEND_WAIT);
    setStep('check-email');
  }

  async function submitForgot() {
    setBusy(true);
    setError(null);
    const result = await sendPasswordReset(data.email);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setForgotSent(true);
  }

  async function resend() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await resendConfirmation(data.email);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setResendLeft(RESEND_WAIT);
    setNotice('Sent again. Look in spam if it does not arrive.');
  }

  function leaveToPasskeyOrHome() {
    if (passkeysAvailable()) {
      setPhase('passkey');
      return;
    }
    void navigate(destination, { replace: true });
  }

  /**
   * `patch` is for "Skip for now", which must submit without the photograph
   * it skips. It used to `set` the file away and then call this, but this
   * reads `data` from the same render, so the file went up anyway.
   */
  async function finish(patch: Partial<OnboardingData> = {}) {
    setPhase('submitting');
    const result = await submitOnboarding({ ...data, ...patch });
    if (!result.ok) {
      setPhase('wizard');
      // A refused photograph is answered on the photo step, whichever
      // button finished: "Finish later" from the city carries a photograph
      // chosen and then gone back past. The file is let go, so the tile
      // shows "+" rather than a preview of something that is not stored.
      if (result.photoRefused) {
        set({ photoFile: null, photoPreviewUrl: null });
        setStep('photo');
      }
      if (result.usernameRefused) {
        set({ usernameChecked: '' });
        setStep('username');
      }
      setError(result.error ?? 'Could not finish signing up.');
      return;
    }
    // Asked once, as they enter, however they finished — see NotificationsStep.
    if (vapidPublicKey()) {
      setPhase('notifications');
      return;
    }
    leaveToPasskeyOrHome();
  }

  if (account.status === 'error') return <AccountProblem account={account} />;

  // Before the check below: the row now exists, and should the account be
  // read again meanwhile, this screen must not vanish under a tap.
  if (phase === 'notifications') {
    return <NotificationsStep userId={account.userId} onDone={leaveToPasskeyOrHome} />;
  }
  if (phase === 'passkey') {
    return (
      <PasskeyOffer
        busy={busy}
        error={error}
        onAdd={() => {
          setBusy(true);
          setError(null);
          void registerPasskey().then((result) => {
            setBusy(false);
            if (result.ok) void navigate(destination, { replace: true });
            else if (result.error) setError(result.error);
          });
        }}
        onSkip={() => {
          void navigate(destination, { replace: true });
        }}
      />
    );
  }

  // Somebody who already finished has no business being asked again.
  // 'suspended' comes here too. /profile and /profile/details live outside the
  // shell and send a non-member to /join, so without this a suspended member
  // bounced to the welcome screen — which invites them to join a club they are
  // already in. Sending them into the shell lands them on the screen that
  // explains the pause.
  if (account.status === 'suspended') return <Navigate to="/home" replace />;
  if (account.status === 'member') {
    return <Navigate to={destination} replace />;
  }

  if (phase === 'blocked') {
    return (
      <BlockedScreen
        email={blockedEmail}
        onTryAnother={() => {
          void signOut().then(() => {
            forgetInviteToken();
            setPhase('wizard');
            setStep('signin');
            setBlockedEmail(null);
            set({ password: '' });
          });
        }}
      />
    );
  }

  if (step === 'welcome') {
    return (
      <WelcomeScreen
        onJoin={() => {
          setStep('join');
        }}
        onSignIn={() => {
          setStep('signin');
        }}
      />
    );
  }

  const back: Record<Step, Step | undefined> = {
    welcome: undefined,
    signin: 'welcome',
    forgot: 'signin',
    join: 'welcome',
    'check-email': 'join',
    // No way back past a confirmed account: it already exists.
    checking: undefined,
    agree: undefined,
    name: undefined,
    username: 'name',
    birthday: 'username',
    injury: 'birthday',
    city: 'injury',
    phone: 'city',
    photo: 'phone',
  };

  /**
   * Where the way out appears. The birthday included, once it is a valid one:
   * name, username and age are the answers a row cannot be written without, so
   * the moment all are in, the rest is optional and there is no reason to make
   * somebody click Continue first to be told so.
   *
   * Everything after them is nullable in the schema — `level_range` has a
   * 'Not sure yet' value, `exact_level`, `injury_date`, `city`, `state`, the
   * phone and the photograph are all optional — and Me is where they get
   * filled in. The phone step has its own, plainer, Skip.
   */
  const SKIPPABLE: Step[] = ['birthday', 'injury', 'city', 'photo'];

  /** The doors take an address, not a question's answer. */
  function doorReady(): boolean {
    if (step === 'signin') return looksLikeEmail(data.email) && data.password.length > 0;
    if (step === 'join') return looksLikeEmail(data.email) && data.password.length >= MIN_PASSWORD;
    if (step === 'forgot') return looksLikeEmail(data.email);
    if (step === 'checking') return error !== null;
    return false;
  }

  const n = stepNumber(step);
  const ready = DOORS.includes(step) || step === 'checking' ? doorReady() : canAdvance(step, data);
  const previous = back[step];
  const working = busy || phase === 'submitting';

  /** What finishing this step does. Shared by the button and by Enter. */
  function advance() {
    if (!ready || working) return;
    if (step === 'signin') return void submitSignIn();
    if (step === 'join') return void submitJoin();
    if (step === 'forgot') return void (forgotSent ? undefined : submitForgot());
    if (step === 'checking') {
      gateRan.current = false;
      return void afterSignIn();
    }
    if (step === 'photo') return void finish();
    const order: Step[] = [
      'agree',
      'name',
      'username',
      'birthday',
      'injury',
      'city',
      'phone',
      'photo',
    ];
    const next = order[order.indexOf(step) + 1];
    if (next) setStep(next);
  }

  const primaryLabel =
    step === 'photo'
      ? 'Enter the club'
      : step === 'signin'
        ? 'Sign in'
        : step === 'join'
          ? 'Create account'
          : step === 'forgot'
            ? 'Send the link'
            : step === 'checking'
              ? 'Try again'
              : 'Continue';

  const showPrimary =
    step !== 'check-email' &&
    !(step === 'forgot' && forgotSent) &&
    !(step === 'checking' && !error);

  return (
    <StepFrame
      stepNumber={n}
      totalSteps={COUNTED_STEPS.length}
      onSubmit={advance}
      onBack={
        previous
          ? () => {
              setError(null);
              setNotice(null);
              setForgotSent(false);
              setStep(previous);
            }
          : undefined
      }
      footer={
        <>
          {error ? (
            <p role="alert" className="mb-2.5 text-[0.8125rem] text-destructive leading-[1.45]">
              {error}
            </p>
          ) : null}
          {notice && step !== 'signin' ? (
            <p role="status" className="mb-2.5 text-[0.8125rem] text-ink2 leading-[1.45]">
              {notice}
            </p>
          ) : null}
          {showPrimary ? (
            <PrimaryButton disabled={!ready || working}>
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : primaryLabel}
            </PrimaryButton>
          ) : null}
          {/* Once the birthday is in, everything left is optional — the
              schema says so — so the rest of the wizard is answerable later
              from Me.

              "Finish later" rather than "Skip for now" anywhere but the
              photo: it skips the remaining questions and enters the club, and
              "skip" on its own reads as skipping only the step in front of
              you. */}
          {/* On the birthday step only once the date is a real, adult one:
              skipping with nothing in it would write a row the database
              refuses, and the refusal would arrive as a sentence about a
              trigger. */}
          {/* "Rather not say" on the injury step, at the owner's request, and
              the same thing the survey offers on every screen: a decline is an
              answer, and a profile made of decisions is finished.
           *
           * It is not "Finish later" and the two have to stay apart. Finish
           * later abandons the whole of the rest of the wizard; this answers
           * this one page and goes on to the next.
           *
           * It declines the level and the date together, the way the survey
           * declines a screen. Complete-or-incomplete is not included: 'Do not
           * know' is already on that list as a real answer. */}
          {/* Declining moves straight on (the owner, 2026-10-01): it is an
              answer, and pressing Continue after it was a second press for
              the same thing. What was entered is cleared, so the row does not
              hold a level beside a decline of it. Back shows the tick, and
              pressing it again takes the decline back. */}
          {step === 'injury' ? (
            <LinkButton
              onClick={() => {
                const declining = !injuryStepDeclined(data);
                set({
                  declined: withInjuryDeclined(data, declining),
                  ...(declining
                    ? { exactLevel: null, injuryYear: '', injuryMonth: '', injuryDay: '' }
                    : {}),
                });
                if (declining) setStep('city');
              }}
            >
              {injuryStepDeclined(data) ? 'Rather not say ✓' : 'Rather not say'}
            </LinkButton>
          ) : null}
          {/* The same for where they live: both halves, as the details form
              declines them, and on to the phone. */}
          {step === 'city' ? (
            <LinkButton
              onClick={() => {
                const declining = !cityStepDeclined(data);
                set({
                  declined: withCityDeclined(data, declining),
                  ...(declining ? { city: '', state: '', zip: '' } : {}),
                });
                if (declining) setStep('phone');
              }}
            >
              {cityStepDeclined(data) ? 'Rather not say ✓' : 'Rather not say'}
            </LinkButton>
          ) : null}
          {step === 'phone' ? (
            <LinkButton
              onClick={() => {
                set({ phone: '' });
                setStep('photo');
              }}
            >
              Skip for now
            </LinkButton>
          ) : null}
          {SKIPPABLE.includes(step) && (step !== 'birthday' || ready) ? (
            <LinkButton
              onClick={() => {
                const skipped = step === 'photo' ? { photoFile: null, photoPreviewUrl: null } : {};
                set(skipped);
                void finish(skipped);
              }}
            >
              {step === 'photo' ? 'Skip for now' : 'Finish later — enter the club'}
            </LinkButton>
          ) : null}
          {/* Landing on the wrong door should not mean starting over. */}
          {step === 'signin' || step === 'join' ? (
            <LinkButton
              onClick={() => {
                setStep(step === 'join' ? 'signin' : 'join');
                setError(null);
                setNotice(null);
              }}
            >
              {step === 'signin' ? 'New here? Join the club' : 'Already a member? Sign in'}
            </LinkButton>
          ) : null}
          {step === 'forgot' && forgotSent ? (
            <LinkButton
              onClick={() => {
                setForgotSent(false);
                setStep('signin');
              }}
            >
              Back to sign in
            </LinkButton>
          ) : null}
        </>
      }
    >
      {step === 'signin' ? (
        <SignInStep
          data={data}
          set={set}
          ways={ways}
          notice={notice}
          onForgot={() => {
            setError(null);
            setStep('forgot');
          }}
        />
      ) : null}
      {step === 'forgot' ? <ForgotStep data={data} set={set} sent={forgotSent} /> : null}
      {step === 'join' ? (
        <JoinStep
          data={data}
          set={set}
          ways={ways}
          invited={invited || heldInviteToken() !== null}
        />
      ) : null}
      {step === 'check-email' ? (
        <CheckEmailStep
          email={cleanEmail(data.email)}
          secondsLeft={resendLeft}
          onResend={() => {
            void resend();
          }}
          onChangeAddress={() => {
            setError(null);
            setNotice(null);
            setStep('join');
          }}
        />
      ) : null}
      {step === 'checking' ? (
        <>
          <Question>Checking your invitation</Question>
          <Sub>One moment.</Sub>
        </>
      ) : null}
      {step === 'agree' ? <AgreeStep data={data} set={set} /> : null}
      {step === 'name' ? <NameStep data={data} set={set} /> : null}
      {step === 'username' ? <UsernameStep data={data} set={set} /> : null}
      {step === 'birthday' ? <BirthdayStep data={data} set={set} /> : null}
      {step === 'injury' ? <InjuryStep data={data} set={set} /> : null}
      {step === 'city' ? <CityStep data={data} set={set} /> : null}
      {step === 'phone' ? <PhoneForEventsStep data={data} set={set} /> : null}
      {step === 'photo' ? (
        <PhotoStep
          data={data}
          set={(patch) => {
            // Another photograph chosen after a refusal: the sentence was
            // about the last one.
            if ('photoFile' in patch) setError(null);
            set(patch);
          }}
        />
      ) : null}
    </StepFrame>
  );
}
