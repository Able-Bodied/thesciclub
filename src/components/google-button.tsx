import { useGoogleButton } from '@/lib/google-identity';

/**
 * Google's button, drawn by Google, with the club's redirect behind it.
 *
 * While Google's script loads, the space is held so the page does not jump.
 * If it never loads, the club's own button takes its place and goes the long
 * way round, through Google's sign-in page. When it does load, a quiet link
 * under it offers that same long way: Google's window is the part that has not
 * been tried in the installed iPhone app, and a member it fails for needs a
 * way that does not depend on it.
 */
export function GoogleButton({
  text,
  prompt = false,
  disabled = false,
  fallbackLabel,
  onToken,
  onFallback,
}: {
  text: 'signin_with' | 'continue_with';
  prompt?: boolean;
  disabled?: boolean;
  /** The club's own button, when Google's is not there: "Sign in with Google". */
  fallbackLabel: string;
  onToken: (token: string, nonce: string) => void;
  onFallback: () => void;
}) {
  const { ref, state } = useGoogleButton({ text, prompt, onToken });

  return (
    <div>
      {/* Google draws into this. Hidden rather than removed when it fails, so
          the ref stays put. Centred, because Google's button stops at 400px. */}
      <div
        ref={ref}
        hidden={state === 'unavailable'}
        aria-busy={state === 'loading'}
        className="flex min-h-[44px] w-full items-center justify-center"
      />
      {state === 'unavailable' ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onFallback}
          className="flex min-h-[44px] w-full items-center justify-center rounded-[13px] border-[1.6px] border-emphasis font-bold font-head text-[0.9375rem] text-emphasis disabled:opacity-50"
        >
          {fallbackLabel}
        </button>
      ) : null}
      {state === 'ready' ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onFallback}
          className="mt-1 flex min-h-[44px] w-full items-center justify-center font-semibold text-[0.8125rem] text-grey underline-offset-2 hover:underline disabled:opacity-50"
        >
          Not working? Use Google’s sign-in page
        </button>
      ) : null}
    </div>
  );
}
