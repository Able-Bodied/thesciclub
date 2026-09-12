import { Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAccount } from '@/lib/account';
import { type BrowseMemberRow, toMember } from '@/lib/members';
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
  COUNTED_STEPS,
  canAdvance,
  INITIAL_ONBOARDING_DATA,
  type OnboardingData,
  type Step,
  stepNumber,
} from '@/routes/onboarding/types';
import { WelcomeScreen } from '@/routes/onboarding/welcome';
import type { BrowseMember } from '@/types/domain';

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

export default function OnboardingPage() {
  const navigate = useNavigate();
  const account = useAccount();
  const [step, setStep] = useState<Step>('welcome');
  const [mode, setMode] = useState<Mode>('join');
  const [phase, setPhase] = useState<Phase>('wizard');
  const [data, setData] = useState<OnboardingData>(INITIAL_ONBOARDING_DATA);
  const [claimable, setClaimable] = useState<BrowseMember | null>(null);
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
      setError(otpError.message);
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
      setError(verifyError.message);
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
      setError(statusResult.error.message);
      return;
    }

    const row = statusResult.data as InviteStatus;
    if (!row.invited) {
      setPhase('blocked');
      return;
    }

    if (row.claimable_member_id) {
      // Same reason as above: maybeSingle() types its data as `any`.
      const profileResult = await supabase
        .from('browse_members')
        .select('*')
        .eq('id', row.claimable_member_id)
        .maybeSingle();
      const profile = profileResult.data as BrowseMemberRow | null;
      if (profile) {
        setClaimable(toMember(profile));
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
  if (account.status === 'member') {
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
          {step === 'photo' ? (
            <LinkButton
              onClick={() => {
                set({ photoFile: null, photoPreviewUrl: null });
                void finish();
              }}
            >
              Skip for now
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
          onAccept={() => {
            set({
              displayName: claimable.displayName,
              exactLevel: claimable.exactLevel,
              completeness: claimable.completeness,
              city: claimable.city ?? '',
              state: claimable.state,
            });
            setStep('name');
          }}
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
