import { ChevronDown, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { GoogleButton } from '@/components/google-button';
import { GoogleInBrowserButton } from '@/components/google-in-browser-button';
import { OpeningIcon } from '@/components/opening-icon';
import { appleSignInEnabled } from '@/lib/apple-sign-in';
import { looksLikeEmail, MIN_PASSWORD } from '@/lib/auth-email';
import type { GoogleInBrowser } from '@/lib/google-in-browser';
import { currentInstallPlatform, type InstallPlatform } from '@/lib/install';
import { passkeysAvailable } from '@/lib/passkeys';
import type { QrCodeDetails } from '@/lib/qr-codes';
import { Field, Fine, Question, Sub, useAutoFocus } from '@/routes/onboarding/chrome';
import type { OnboardingData } from '@/routes/onboarding/types';

/**
 * The doors: sign in, join, forgot password, and the "check your email" wait.
 *
 * Which door somebody came through changes the wording and nothing else.
 * Where they end up is decided by what is true of their account afterwards
 * (page.tsx, `afterSignIn`), so Join for somebody who already has a profile
 * simply lets them in.
 *
 * Apple and passkeys are shown only when their switches are on
 * (VITE_APPLE_SIGN_IN, VITE_PASSKEYS), and a passkey only in a browser that
 * can use one. Which of Google and Apple leads depends on the device
 * (`leadingWayIn`).
 */

interface FieldsProps {
  data: OnboardingData;
  set: (patch: Partial<OnboardingData>) => void;
}

interface WaysIn {
  busy: boolean;
  onGoogleToken: (token: string, nonce: string) => void;
  onGoogleRedirect: () => void;
  /** The iPhone Home Screen app's way to Google, through Chrome or Safari; null elsewhere. */
  googleInBrowser: GoogleInBrowser | null;
  onApple: () => void;
  /** Taps that have left for Apple, for the button's circle. */
  appleTaps: number;
  onPasskey: () => void;
}

const SOCIAL_BUTTON =
  'mt-2 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] font-bold font-head text-[0.9375rem] disabled:opacity-50';

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <p className="my-4 flex items-center gap-3 text-center text-[0.78125rem] text-grey">
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
      {children}
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
    </p>
  );
}

/**
 * Which way in leads, from the device (the owner, 2026-10-15): Apple on an
 * iPhone or iPad, Google on Android, and both, side by side, anywhere else.
 * The one that does not lead is a tap away under "Other ways", never gone:
 * somebody signs in the way they joined, whatever the device.
 */
export function leadingWayIn(
  platform: InstallPlatform,
  appleOn: boolean,
): 'apple' | 'google' | 'both' {
  if (!appleOn) return 'google';
  if (platform.startsWith('ios')) return 'apple';
  if (platform === 'android') return 'google';
  return 'both';
}

/** Apple's logo, which its guidelines put on the button. */
function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current" aria-hidden="true">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

function SocialButtons({ mode, ways }: { mode: 'signin' | 'join'; ways: WaysIn }) {
  const [lead] = useState(() => leadingWayIn(currentInstallPlatform(), appleSignInEnabled()));
  // Open from the start while the Home Screen app waits on a Google sign-in,
  // so its "Finish in Chrome" is not hidden behind Apple.
  const [othersOpen, setOthersOpen] = useState(
    () => lead === 'apple' && ways.googleInBrowser?.state.step === 'waiting',
  );

  const google = (
    <div className="mt-2">
      {ways.googleInBrowser ? (
        <GoogleInBrowserButton
          google={ways.googleInBrowser}
          label={mode === 'signin' ? 'Sign in with Google' : 'Continue with Google'}
          disabled={ways.busy}
        />
      ) : (
        <GoogleButton
          text={mode === 'signin' ? 'signin_with' : 'continue_with'}
          prompt={mode === 'signin'}
          disabled={ways.busy}
          fallbackLabel={mode === 'signin' ? 'Sign in with Google' : 'Continue with Google'}
          onToken={ways.onGoogleToken}
          onFallback={ways.onGoogleRedirect}
        />
      )}
    </div>
  );
  const apple = (
    <button
      type="button"
      disabled={ways.busy}
      onClick={ways.onApple}
      className={`${SOCIAL_BUTTON} bg-black text-white`}
    >
      <OpeningIcon taps={ways.appleTaps}>
        <AppleLogo />
      </OpeningIcon>
      {mode === 'signin' ? 'Sign in with Apple' : 'Continue with Apple'}
    </button>
  );

  return (
    <>
      {mode === 'signin' && passkeysAvailable() ? (
        <button
          type="button"
          disabled={ways.busy}
          onClick={ways.onPasskey}
          className={`${SOCIAL_BUTTON} bg-action text-white`}
        >
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          Sign in with a passkey
        </button>
      ) : null}
      {lead === 'both' ? (
        <>
          {google}
          {apple}
        </>
      ) : (
        <>
          {lead === 'apple' ? apple : google}
          {appleSignInEnabled() ? (
            <>
              <button
                type="button"
                aria-expanded={othersOpen}
                aria-controls="other-ways-in"
                onClick={() => {
                  setOthersOpen((open) => !open);
                }}
                className="mt-1 flex min-h-[44px] w-full items-center justify-center gap-1 font-semibold text-[0.8125rem] text-emphasis"
              >
                {mode === 'signin' ? 'Other ways to sign in' : 'Other ways to join'}
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${othersOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
              <div id="other-ways-in" hidden={!othersOpen}>
                {othersOpen ? (lead === 'apple' ? google : apple) : null}
              </div>
            </>
          ) : null}
        </>
      )}
    </>
  );
}

export function SignInStep({
  data,
  set,
  ways,
  notice,
  onForgot,
}: FieldsProps & { ways: WaysIn; notice: string | null; onForgot: () => void }) {
  // Arriving with the address filled in, only the password is left to type.
  const [emailGiven] = useState(() => looksLikeEmail(data.email));
  const emailRef = useAutoFocus(!emailGiven);
  const passwordRef = useAutoFocus(emailGiven);
  return (
    <>
      <Question>Welcome back</Question>
      <Sub>Sign in the way you joined.</Sub>
      {notice ? (
        <p role="status" className="mt-3 text-[0.84375rem] text-ink2 leading-[1.5]">
          {notice}
        </p>
      ) : null}
      <SocialButtons mode="signin" ways={ways} />
      <Divider>or use your email</Divider>
      <label htmlFor="email" className="block font-bold text-[0.8125rem] text-ink">
        Email
      </label>
      <Field
        ref={emailRef}
        id="email"
        type="email"
        inputMode="email"
        // "webauthn" lets the browser offer a saved passkey right in this box.
        autoComplete="username webauthn"
        autoCapitalize="none"
        placeholder="you@example.com"
        value={data.email}
        onChange={(e) => {
          set({ email: e.target.value });
        }}
      />
      <label htmlFor="password" className="mt-4 block font-bold text-[0.8125rem] text-ink">
        Password
      </label>
      <Field
        ref={passwordRef}
        id="password"
        type="password"
        autoComplete="current-password"
        value={data.password}
        onChange={(e) => {
          set({ password: e.target.value });
        }}
      />
      <button
        type="button"
        onClick={onForgot}
        className="mt-2 flex min-h-[44px] items-center font-bold text-[0.875rem] text-emphasis"
      >
        Forgot password?
      </button>
    </>
  );
}

export function JoinStep({
  data,
  set,
  ways,
  invited,
  inviteAddress,
  joiningOpen = false,
  fromCode = null,
}: FieldsProps & {
  ways: WaysIn;
  invited: boolean;
  inviteAddress: string | null;
  /** Anybody can join right now (20261014000000). */
  joiningOpen?: boolean;
  /** The administrator's QR code they came by (20261014020000), if it says anything. */
  fromCode?: QrCodeDetails | null;
}) {
  const emailRef = useAutoFocus();
  return (
    <>
      <Question>Join the club</Question>
      <Sub>
        {invited ? (
          'You have an invitation. Join with any email or account, and it will be waiting.'
        ) : fromCode?.joiningOpen ? (
          `${fromCode.inviterName} invited you to The SCI Club. Join with any email or account.`
        ) : fromCode ? (
          <AskForInvite who={fromCode} />
        ) : joiningOpen ? (
          'Anybody can join right now. Join with any email or account.'
        ) : (
          'Joining is by invitation. Use the email address you were invited at, or open the link in your invitation.'
        )}
      </Sub>
      <SocialButtons mode="join" ways={ways} />
      <Divider>or join with your email</Divider>
      <label htmlFor="email" className="block font-bold text-[0.8125rem] text-ink">
        Email
      </label>
      <Field
        ref={emailRef}
        id="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        placeholder="you@example.com"
        value={data.email}
        onChange={(e) => {
          set({ email: e.target.value });
        }}
      />
      {inviteAddress !== null ? (
        <Fine>
          This is the address your invitation was sent to. Change it if you prefer another.
        </Fine>
      ) : null}
      <label htmlFor="password" className="mt-4 block font-bold text-[0.8125rem] text-ink">
        Password
      </label>
      <Field
        id="password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD}
        value={data.password}
        onChange={(e) => {
          set({ password: e.target.value });
        }}
      />
      <label htmlFor="password-again" className="mt-4 block font-bold text-[0.8125rem] text-ink">
        Type it again
      </label>
      <Field
        id="password-again"
        type="password"
        autoComplete="new-password"
        value={data.passwordAgain}
        onChange={(e) => {
          set({ passwordAgain: e.target.value });
        }}
      />
      {data.passwordAgain !== '' && data.password !== data.passwordAgain ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
          The two passwords do not match.
        </p>
      ) : null}
      <Fine>
        At least {MIN_PASSWORD} characters. We will email you a link to confirm the address.
      </Fine>
    </>
  );
}

export function ForgotStep({ data, set, sent }: FieldsProps & { sent: boolean }) {
  const emailRef = useAutoFocus();
  if (sent) {
    return (
      <>
        <Question>Check your email</Question>
        <Sub>
          If {data.email.trim()} has an account, a link to choose a new password is on its way. Look
          in spam if it does not arrive in a minute.
        </Sub>
      </>
    );
  }
  return (
    <>
      <Question>Forgot your password?</Question>
      <Sub>Enter your email and we will send you a link to choose a new one.</Sub>
      <label htmlFor="email" className="mt-5 block font-bold text-[0.8125rem] text-ink">
        Email
      </label>
      <Field
        ref={emailRef}
        id="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        placeholder="you@example.com"
        value={data.email}
        onChange={(e) => {
          set({ email: e.target.value });
        }}
      />
    </>
  );
}

export function CheckEmailStep({
  email,
  secondsLeft,
  busy,
  onResend,
  onChangeAddress,
}: {
  email: string;
  secondsLeft: number;
  /** Off while sending: the wait starts only once the server answers. */
  busy: boolean;
  onResend: () => void;
  onChangeAddress: () => void;
}) {
  return (
    <>
      <Question>Check your email</Question>
      <Sub>
        We sent a link to <b className="text-ink">{email}</b>. Open it to confirm the address and
        you will come straight back here. Look in spam if it does not arrive in a minute.
      </Sub>
      <Sub>Opening it on your phone? This screen goes on by itself once you have.</Sub>
      <button
        type="button"
        disabled={busy || secondsLeft > 0}
        onClick={onResend}
        className="mt-5 flex min-h-[48px] w-full items-center justify-center rounded-[13px] border-[1.6px] border-emphasis font-bold font-head text-[0.9375rem] text-emphasis disabled:opacity-50"
      >
        {busy ? 'Sending…' : secondsLeft > 0 ? `Send it again in ${secondsLeft}s` : 'Send it again'}
      </button>
      <button
        type="button"
        onClick={onChangeAddress}
        className="mt-1 flex min-h-[44px] w-full items-center justify-center font-bold text-[0.875rem] text-emphasis"
      >
        Use a different address
      </button>
    </>
  );
}

/** After the questions: the offer, when the switch is on and the browser can. */
export function PasskeyOffer({
  busy,
  error,
  onAdd,
  onSkip,
}: {
  busy: boolean;
  error: string | null;
  onAdd: () => void;
  onSkip: () => void;
}) {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-canvas">
      <div className="flex-1 overflow-y-auto px-[18px] pt-12">
        <h1 className="font-extrabold font-display text-[1.5625rem] text-ink leading-tight tracking-[-0.01em]">
          Sign in faster next time?
        </h1>
        <p className="mt-2.5 text-[0.8875rem] text-ink2 leading-[1.52]">
          Use Face ID or your fingerprint next time, instead of typing a password.
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-[0.8125rem] text-destructive leading-[1.45]">
            {error}
          </p>
        ) : null}
      </div>
      <footer className="flex-none px-[18px] pt-3 pb-[max(22px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={busy}
          onClick={onAdd}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] bg-gold font-bold font-head text-on-gold text-[0.9375rem] disabled:opacity-50"
        >
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          Set up a passkey
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="mt-1 flex min-h-[44px] w-full items-center justify-center font-bold text-[0.875rem] text-emphasis"
        >
          Not now
        </button>
      </footer>
    </main>
  );
}

/**
 * A QR code scanned while joining is closed (20261014020000): it lets nobody
 * in, so it says who to ask, with the email they chose to show. The owner,
 * 2026-10-14: "Ask Alfred for an invite. Email: …".
 */
export function AskForInvite({ who }: { who: QrCodeDetails }) {
  return (
    <>
      Joining is by invitation right now. Ask {who.inviterName} for an invite.
      {who.contactEmail ? (
        <>
          {' '}
          Email:{' '}
          <a
            href={`mailto:${who.contactEmail}`}
            className="break-all font-bold text-emphasis underline"
          >
            {who.contactEmail}
          </a>
        </>
      ) : null}
    </>
  );
}
