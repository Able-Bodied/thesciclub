import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { GoogleButton } from '@/components/google-button';
import { signOut, useAccount } from '@/lib/account';
import { describeError } from '@/lib/describe-error';
import {
  GOOGLE_NOT_LINKED,
  GOOGLE_RETURN_PARAM,
  isPhoneless,
  signInWithGoogle,
  signInWithGoogleToken,
} from '@/lib/google-sign-in';
import { toE164 } from '@/lib/phone';
import { vapidPublicKey } from '@/lib/push/notifications';
import { getSupabase } from '@/lib/supabase';
import { BlockedScreen } from '@/routes/onboarding/blocked';
import { LinkButton, PrimaryButton, StepFrame } from '@/routes/onboarding/chrome';
import { NotificationsStep } from '@/routes/onboarding/notifications-step';
import {
  AgreeStep,
  BirthdayStep,
  CityStep,
  ClaimStep,
  CodeStep,
  InjuryStep,
  NameStep,
  PhoneStep,
  PhotoStep,
} from '@/routes/onboarding/steps';
import { submitOnboarding } from '@/routes/onboarding/submit-onboarding';
import {
  type ClaimableProfile,
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
 * Joining the club.
 *
 * The order of the first three screens is the security decision in this file.
 * The number is verified *before* the club says whether it is on the list,
 * because a check that anybody can run against any number would disclose who
 * has a spinal cord injury. See the migration for my_invite_status().
 *
 * So: number, code, and only then does the answer come back — either the
 * blocked screen, or the rest of the questions. It costs an SMS to somebody who
 * turns out not to be invited. That is the cheaper of the two mistakes.
 */

/** `notifications` is after the profile is saved, before Home: see NotificationsStep. */
type Phase = 'wizard' | 'blocked' | 'submitting' | 'notifications';

/**
 * Which door somebody came through.
 *
 * It changes the wording and nothing else. Where they end up after verifying is
 * decided by what is actually true of their number — whether they already have
 * a profile, and whether they are on the list — not by which button they
 * pressed. Somebody who taps Join but already has a profile should simply be
 * let in, and somebody who taps Sign in but has never finished signing up
 * should be handed the questions rather than an error.
 */
type Mode = 'join' | 'signin';

/** What my_invite_status() returns. See the migration of the same name. */
interface InviteStatus {
  invited: boolean;
  claimable_member_id: string | null;
}

/** What my_claimable_profile() returns, before it is given camel case. */
interface ClaimableProfileRow {
  id: string;
  display_name: string;
  photo_path: string | null;
  photo_alt: string | null;
  city: string | null;
  state: string;
  level_range: ClaimableProfile['levelRange'];
  exact_level: ClaimableProfile['exactLevel'];
  completeness: ClaimableProfile['completeness'];
  affiliations: string[] | null;
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const account = useAccount();
  const [step, setStep] = useState<Step>('welcome');
  const [mode, setMode] = useState<Mode>('join');
  const [phase, setPhase] = useState<Phase>('wizard');
  const [data, setData] = useState<OnboardingData>(INITIAL_ONBOARDING_DATA);
  const [claimable, setClaimable] = useState<ClaimableProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = useCallback((patch: Partial<OnboardingData>) => {
    setData((d) => ({ ...d, ...patch }));
  }, []);

  /**
   * Back from Google without getting in.
   *
   * A member whose Google is linked comes back signed in, and the guard below
   * sends them to Home. Anybody else comes back to the sign-in door with a
   * sentence: they pressed Cancel, or the Google account is linked to nobody.
   * In that second case the account Google made is signed back out — it has
   * no phone number, so it can never be a member (src/lib/google-sign-in.ts).
   * That is checked whenever an account is signed up, not only on the way
   * back, so one left over from an earlier visit is not walked into the
   * questions.
   */
  const [params, setParams] = useSearchParams();
  const fromGoogle = params.get(GOOGLE_RETURN_PARAM) === 'signin';
  useEffect(() => {
    if (account.status === 'loading' || account.status === 'member') return;
    if (account.status === 'suspended') return;
    const controller = new AbortController();
    const cancelled = () => controller.signal.aborted;
    void (async () => {
      // A failed check is not a stray: the questions are the safe default
      // for a signed-up account, and the database refuses the rest.
      const stray = account.status === 'signed-up' && (await isPhoneless().catch(() => false));
      if (cancelled() || (!stray && !fromGoogle)) return;
      if (stray) await signOut();
      if (cancelled()) return;
      setMode('signin');
      setStep('phone');
      setError(GOOGLE_NOT_LINKED);
      if (fromGoogle) {
        setParams(
          (p) => {
            p.delete(GOOGLE_RETURN_PARAM);
            return p;
          },
          { replace: true },
        );
      }
    })();
    return () => {
      controller.abort();
    };
  }, [account.status, fromGoogle, setParams]);

  /**
   * Google's widget picked an account. A linked one becomes a session, and the
   * guard below takes it to Home; an unlinked one is refused by the database
   * and gets the same sentence as the redirect.
   */
  async function signInWithToken(token: string, nonce: string) {
    setBusy(true);
    setError(null);
    const result = await signInWithGoogleToken(token, nonce).catch(() => ({
      ok: false as const,
      error: GOOGLE_NOT_LINKED,
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

  /**
   * Holds the phone's number pad open between the number and the code.
   *
   * iOS opens the keyboard only for a focus that happens inside a tap, and
   * the code step appears after `signInWithOtp` has answered — long after the
   * tap on Continue — so its field took focus with the keyboard shut, and a
   * member had to tap the box for the pad (the owner, 2026-10-01). Focus
   * moved *from* one field *to* another keeps the keyboard up, though, so the
   * tap itself puts focus here, in an invisible numeric field that stays
   * mounted through the wait, and the code field takes it over when it
   * appears (`useAutoFocus`). If the code is not sent, focus goes back to the
   * number. 16px, or iOS zooms the page to it.
   */
  const keyboardHold = useRef<HTMLInputElement>(null);

  /** Send the code. No invite check here, on purpose — see the file header. */
  async function requestCode(typed: string = data.phone) {
    // Supabase wants E.164; the field holds what the person typed.
    const phone = toE164(typed);
    if (!phone) {
      setError('That does not look like a ten-digit US number.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: otpError } = await getSupabase().auth.signInWithOtp({ phone });
    setBusy(false);
    if (otpError) {
      setError(describeError(otpError, 'The code was not sent.'));
      document.getElementById('phone')?.focus({ preventScroll: true });
      return;
    }
    setStep('code');
  }

  /**
   * Verify, then — and only then — ask whether this number is on the list.
   *
   * Runs on its own when the sixth digit goes in (the owner, 2026-10-01), as
   * well as from Continue, so `token` is handed in: the keystroke that
   * completes the code has not reached `data` yet.
   */
  async function verifyCode(token: string = data.code) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const supabase = getSupabase();
    const phone = toE164(data.phone);
    if (!phone) {
      setBusy(false);
      setError('That does not look like a ten-digit US number.');
      return;
    }
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });
    if (verifyError) {
      setBusy(false);
      setError(describeError(verifyError, 'That code was not accepted.'));
      return;
    }

    // Taken whole rather than destructured: rpc() types its payload as `any`,
    // and destructuring would launder that straight into a branch that decides
    // whether somebody is let into the club.
    // Already a member? Then this was a sign-in, whichever button was pressed.
    // Checked before the invite list, because somebody who has joined does not
    // need to be re-vetted — and because their invite is consumed, not pending.
    const existing = await supabase.from('members').select('id').maybeSingle();
    if (existing.data) {
      setBusy(false);
      void navigate('/home', { replace: true });
      return;
    }

    const statusResult = await supabase.rpc('my_invite_status').single();
    setBusy(false);
    if (statusResult.error) {
      setError(describeError(statusResult.error, 'Could not check whether you are on the list.'));
      return;
    }

    const row = statusResult.data as InviteStatus;
    if (!row.invited) {
      setPhase('blocked');
      return;
    }

    // The sign-in door asked for no ticks, and this is a join. See AgreeStep.
    const agreed = data.smsConsent && data.termsAgreed;

    if (row.claimable_member_id) {
      // Not `browse_members`. That view requires the viewer to be an active
      // member — correctly, since 20260911110000 — and somebody part-way
      // through onboarding is not one, so it answered nothing and the claim
      // was silently skipped while the seeded row was retired anyway.
      // my_claimable_profile() is a definer function keyed on the caller's
      // own verified number.
      const profileResult = await supabase.rpc('my_claimable_profile').maybeSingle();
      const profile = profileResult.data as ClaimableProfileRow | null;
      if (profile) {
        setClaimable({
          id: profile.id,
          displayName: profile.display_name,
          photoPath: profile.photo_path,
          photoAlt: profile.photo_alt,
          city: profile.city,
          state: profile.state,
          levelRange: profile.level_range,
          exactLevel: profile.exact_level,
          completeness: profile.completeness,
          affiliations: profile.affiliations ?? [],
        });
        setStep(agreed ? 'claim' : 'agree');
        return;
      }
    }
    setStep(agreed ? 'name' : 'agree');
  }

  /**
   * `patch` is for "Skip for now", which must submit without the photograph
   * it skips. It used to `set` the file away and then call this, but this
   * reads `data` from the same render, so the file went up anyway — which,
   * once the bucket refused files, would have kept Skip on the photo step.
   */
  function enterTheClub() {
    void navigate('/home', { replace: true });
  }

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
      setError(result.error ?? 'Could not finish signing up.');
      return;
    }
    // Asked once, as they enter, however they finished — see NotificationsStep.
    if (vapidPublicKey()) {
      setPhase('notifications');
      return;
    }
    void navigate('/home', { replace: true });
  }

  // Before the check below: the row now exists, and should the account be
  // read again meanwhile, this screen must not vanish under a tap.
  if (phase === 'notifications') {
    return <NotificationsStep userId={account.userId} onDone={enterTheClub} />;
  }

  // Somebody who already finished has no business being asked again.
  // 'suspended' comes here too. /profile and /profile/details live outside the
  // shell and send a non-member to /join, so without this a suspended member
  // bounced to the welcome screen — which invites them to join a club they are
  // already in. Sending them into the shell lands them on the screen that
  // explains the pause.
  if (account.status === 'member' || account.status === 'suspended') {
    return <Navigate to="/home" replace />;
  }

  if (phase === 'blocked') {
    return (
      <BlockedScreen
        onTryAnother={() => {
          setPhase('wizard');
          setStep('phone');
          set({ code: '' });
        }}
      />
    );
  }

  if (step === 'welcome') {
    return (
      <WelcomeScreen
        onJoin={() => {
          setMode('join');
          setStep('phone');
        }}
        onSignIn={() => {
          setMode('signin');
          setStep('phone');
        }}
      />
    );
  }

  const back: Record<Step, Step | undefined> = {
    welcome: undefined,
    phone: 'welcome',
    code: 'phone',
    // No way back past a verified number: the account already exists.
    agree: undefined,
    claim: undefined,
    name: undefined,
    birthday: 'name',
    injury: 'birthday',
    city: 'injury',
    photo: 'city',
  };

  /**
   * Where the way out appears. The birthday included, once it is a valid one:
   * name and age are the two answers a row cannot be written without, so the
   * moment both are in, the rest is optional and there is no reason to make
   * somebody click Continue first to be told so.
   *
   * Everything after them is nullable in the schema — `level_range` has a
   * 'Not sure yet' value, `exact_level`, `injury_date`, `city`, `state` and
   * the photograph are all optional — and Me is where they get filled in.
   */
  const SKIPPABLE: Step[] = ['birthday', 'injury', 'city', 'photo'];

  const n = stepNumber(step);
  const ready = canAdvance(step, data, mode === 'signin');
  const previous = back[step];

  /** What finishing this step does. Shared by the button and by Enter. */
  function advance() {
    if (!ready || busy || phase === 'submitting') return;
    if (step === 'phone') {
      // Inside the tap, before anything is awaited — see `keyboardHold`.
      keyboardHold.current?.focus({ preventScroll: true });
      return void requestCode();
    }
    if (step === 'code') return void verifyCode();
    // On to whatever verifying found: the claim, if there is one to offer.
    if (step === 'agree') {
      setStep(claimable ? 'claim' : 'name');
      return;
    }
    if (step === 'photo') return void finish();
    const order: Step[] = ['name', 'birthday', 'injury', 'city', 'photo'];
    const next = order[order.indexOf(step) + 1];
    if (next) setStep(next);
  }

  return (
    <StepFrame
      stepNumber={n}
      totalSteps={COUNTED_STEPS.length}
      onSubmit={advance}
      onBack={
        previous
          ? () => {
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
          {step === 'claim' ? null : (
            <PrimaryButton disabled={!ready || busy || phase === 'submitting'}>
              {busy || phase === 'submitting' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : step === 'photo' ? (
                'Enter the club'
              ) : (
                'Continue'
              )}
            </PrimaryButton>
          )}
          {/* Once the birthday is in, everything left is optional — the
              schema says so: `level_range` has a 'Not sure yet' value,
              `injury_date`, `city`, `state` and the photograph are all
              nullable. So the rest of the wizard is answerable later from Me,
              and somebody claiming a seeded profile has had most of it
              answered for them already. Name and birthday stay required
              because a row needs a name and the club is 18+.

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
           * this one page and goes on to the next, which until now was not
           * possible at all — somebody who did not want to give their level had
           * to leave the flow to get past it.
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
              declines them, and on to the photograph. */}
          {step === 'city' ? (
            <LinkButton
              onClick={() => {
                const declining = !cityStepDeclined(data);
                set({
                  declined: withCityDeclined(data, declining),
                  ...(declining ? { city: '', state: '', zip: '' } : {}),
                });
                if (declining) setStep('photo');
              }}
            >
              {cityStepDeclined(data) ? 'Rather not say ✓' : 'Rather not say'}
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
          {/* Offered to everybody on the sign-in door, because nothing here
              knows who is signing in until they have. It opens only an
              account Google has been linked to from Me; any other comes back
              here with a sentence saying so. Not on the join door: nobody
              joins through Google. */}
          {step === 'phone' && mode === 'signin' ? (
            <div className="mt-2">
              <GoogleButton
                text="signin_with"
                prompt
                disabled={busy}
                fallbackLabel="Sign in with Google"
                onToken={(token, nonce) => {
                  void signInWithToken(token, nonce);
                }}
                onFallback={() => {
                  void continueWithGoogle();
                }}
              />
            </div>
          ) : null}
          {/* Landing on the wrong door should not mean starting over. The two
              flows share every screen up to here, so switching costs nothing
              but the wording. */}
          {step === 'phone' ? (
            <LinkButton
              onClick={() => {
                setMode(mode === 'join' ? 'signin' : 'join');
                setError(null);
              }}
            >
              {mode === 'signin'
                ? "Don't have an account yet? Join the club"
                : 'Already a member? Sign in'}
            </LinkButton>
          ) : null}
        </>
      }
    >
      {/* Always rendered, in the same place, so it is still mounted when the
          code step replaces the phone step. Out of the reading order and
          the tab order; see `keyboardHold`. */}
      <input
        ref={keyboardHold}
        aria-hidden="true"
        tabIndex={-1}
        inputMode="numeric"
        // Not readOnly: iOS opens no keyboard for a read-only field. What is
        // typed here in the moment before the code step is never read.
        className="pointer-events-none fixed top-0 left-0 h-px w-px text-[16px] opacity-0"
      />
      {step === 'phone' ? (
        <PhoneStep
          data={data}
          set={set}
          mode={mode}
          onComplete={
            mode === 'signin'
              ? (phone) => {
                  if (busy) return;
                  // Inside the keystroke or the autofill, as advance() does
                  // inside the tap — see `keyboardHold`. The number is passed
                  // in because `data` here is from before this change.
                  keyboardHold.current?.focus({ preventScroll: true });
                  void requestCode(phone);
                }
              : undefined
          }
        />
      ) : null}
      {step === 'code' ? (
        <CodeStep
          data={data}
          set={set}
          onComplete={(code) => {
            void verifyCode(code);
          }}
        />
      ) : null}
      {step === 'agree' ? <AgreeStep data={data} set={set} /> : null}
      {step === 'claim' && claimable ? (
        <ClaimStep
          profile={claimable}
          // Straight to the birthday, not to the name. The claim has already
          // answered the name, the level, the completeness and the place, so
          // walking somebody through five screens to confirm what an
          // organization asserted about them is asking them to type their
          // own profile back in. The birthday is the one thing a claim cannot
          // supply — the row requires it and the club is 18+ — and once it is
          // in, "Finish later" is on the next screen.
          onAccept={() => {
            set({
              displayName: claimable.displayName,
              exactLevel: claimable.exactLevel,
              completeness: claimable.completeness,
              city: claimable.city ?? '',
              state: claimable.state,
            });
            setStep('birthday');
          }}
          // Declining starts at the name and carries nothing across: the
          // pre-fill only happens on accept, and `startFresh` tells the claim
          // trigger not to copy the rest of the seed. There is no way back
          // to this step, so the choice cannot be changed after it.
          onDecline={() => {
            set({ startFresh: true });
            setStep('name');
          }}
        />
      ) : null}
      {step === 'name' ? <NameStep data={data} set={set} /> : null}
      {step === 'birthday' ? <BirthdayStep data={data} set={set} /> : null}
      {step === 'injury' ? <InjuryStep data={data} set={set} /> : null}
      {step === 'city' ? <CityStep data={data} set={set} /> : null}
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
