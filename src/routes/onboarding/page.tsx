import { Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAccount } from '@/lib/account';
import { describeError } from '@/lib/describe-error';
import { toE164 } from '@/lib/phone';
import { getSupabase } from '@/lib/supabase';
import { BlockedScreen } from '@/routes/onboarding/blocked';
import { LinkButton, PrimaryButton, StepFrame } from '@/routes/onboarding/chrome';
import {
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
  INITIAL_ONBOARDING_DATA,
  injuryStepDeclined,
  type OnboardingData,
  type Step,
  stepNumber,
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

type Phase = 'wizard' | 'blocked' | 'submitting';

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

  /** Send the code. No invite check here, on purpose — see the file header. */
  async function requestCode() {
    // Supabase wants E.164; the field holds what the person typed.
    const phone = toE164(data.phone);
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
      return;
    }
    setStep('code');
  }

  /** Verify, then — and only then — ask whether this number is on the list. */
  async function verifyCode() {
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
      token: data.code,
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
      void navigate('/peers', { replace: true });
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
        setStep('claim');
        return;
      }
    }
    setStep('name');
  }

  async function finish() {
    setPhase('submitting');
    const result = await submitOnboarding(data);
    if (!result.ok) {
      setPhase('wizard');
      setError(result.error ?? 'Could not finish signing up.');
      return;
    }
    void navigate('/peers', { replace: true });
  }

  // Somebody who already finished has no business being asked again.
  // 'suspended' comes here too. /profile and /profile/details live outside the
  // shell and send a non-member to /join, so without this a suspended member
  // bounced to the welcome screen — which invites them to join a club they are
  // already in. Sending them into the shell lands them on the screen that
  // explains the pause.
  if (account.status === 'member' || account.status === 'suspended') {
    return <Navigate to="/peers" replace />;
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
  const ready = canAdvance(step, data);
  const previous = back[step];

  /** What finishing this step does. Shared by the button and by Enter. */
  function advance() {
    if (!ready || busy || phase === 'submitting') return;
    if (step === 'phone') return void requestCode();
    if (step === 'code') return void verifyCode();
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
            <p className="mb-2.5 text-[0.8125rem] text-destructive leading-[1.45]">{error}</p>
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
          {step === 'injury' ? (
            <LinkButton
              onClick={() => {
                set({ declined: withInjuryDeclined(data, !injuryStepDeclined(data)) });
              }}
            >
              {injuryStepDeclined(data) ? 'Rather not say ✓' : 'Rather not say'}
            </LinkButton>
          ) : null}
          {SKIPPABLE.includes(step) && (step !== 'birthday' || ready) ? (
            <LinkButton
              onClick={() => {
                if (step === 'photo') set({ photoFile: null, photoPreviewUrl: null });
                void finish();
              }}
            >
              {step === 'photo' ? 'Skip for now' : 'Finish later — enter the club'}
            </LinkButton>
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
      {step === 'phone' ? <PhoneStep data={data} set={set} mode={mode} /> : null}
      {step === 'code' ? <CodeStep data={data} set={set} /> : null}
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
          // pre-fill only happens on accept, so there is nothing to undo.
          onDecline={() => {
            setStep('name');
          }}
        />
      ) : null}
      {step === 'name' ? <NameStep data={data} set={set} /> : null}
      {step === 'birthday' ? <BirthdayStep data={data} set={set} /> : null}
      {step === 'injury' ? <InjuryStep data={data} set={set} /> : null}
      {step === 'city' ? <CityStep data={data} set={set} /> : null}
      {step === 'photo' ? <PhotoStep data={data} set={set} /> : null}
    </StepFrame>
  );
}
