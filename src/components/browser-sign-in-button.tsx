import { Globe } from 'lucide-react';
import type { BrowserSignIn } from '@/lib/browser-sign-in';

/**
 * "Continue sign in using your browser (no password)", in the iPhone app's
 * Welcome back (src/lib/browser-sign-in.ts; the owner's words, 2026-11-15).
 * Waiting, it says what to do in the browser and that the way back is here.
 */
export function BrowserSignInButton({
  signIn,
  disabled = false,
}: {
  signIn: BrowserSignIn;
  disabled?: boolean;
}) {
  if (signIn.waiting) {
    return (
      <div role="status" className="mt-2 rounded-[13px] border-[1.6px] border-line px-4 py-3.5">
        <p className="font-bold font-head text-[0.9375rem] text-ink">Finish in your browser</p>
        <p className="mt-1 text-[0.84375rem] text-ink2 leading-[1.5]">
          Sign in there if it asks, then press Continue. Come back to this app, and you will be
          signed in.
        </p>
        <button
          type="button"
          onClick={signIn.reopen}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[13px] border-[1.6px] border-emphasis font-bold font-head text-[0.9375rem] text-emphasis"
        >
          Open the browser again
        </button>
        <button
          type="button"
          onClick={signIn.cancel}
          className="mt-1 flex min-h-[44px] w-full items-center justify-center font-semibold text-[0.8125rem] text-grey underline-offset-2 hover:underline"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={disabled}
        onClick={signIn.start}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] border-[1.6px] border-emphasis px-3 text-center font-bold font-head text-[0.9375rem] text-emphasis leading-tight disabled:opacity-50"
      >
        <Globe className="h-4 w-4 flex-none" aria-hidden="true" />
        Continue sign in using your browser (no password)
      </button>
      {signIn.problem ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
          {signIn.problem}
        </p>
      ) : null}
    </div>
  );
}
