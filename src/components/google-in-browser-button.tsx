import { Loader2 } from 'lucide-react';
import { BROWSER_NAMES, type GoogleInBrowser } from '@/lib/google-in-browser';

/**
 * Google's button in the iPhone Home Screen app, where Google's own cannot
 * list any accounts: it opens Chrome or Safari, and then says what to do
 * there and that the way back is to come back here (src/lib/google-in-browser.ts).
 */
export function GoogleInBrowserButton({
  google,
  label,
  disabled = false,
}: {
  google: GoogleInBrowser;
  /** "Sign in with Google" or "Continue with Google". */
  label: string;
  disabled?: boolean;
}) {
  const { state, problem } = google;

  if (state.step === 'waiting') {
    const name = state.browser ? BROWSER_NAMES[state.browser] : 'your browser';
    return (
      <div role="status" className="rounded-[13px] border-[1.6px] border-line px-4 py-3.5">
        <p className="font-bold font-head text-[0.9375rem] text-ink">Finish in {name}</p>
        <p className="mt-1 text-[0.84375rem] text-ink2 leading-[1.5]">
          Choose your Google account there and press Continue. Then come back to this app, and you
          will be signed in.
        </p>
        <button
          type="button"
          onClick={google.reopen}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[13px] border-[1.6px] border-emphasis font-bold font-head text-[0.9375rem] text-emphasis"
        >
          Open {name} again
        </button>
        <button
          type="button"
          onClick={google.cancel}
          className="mt-1 flex min-h-[44px] w-full items-center justify-center font-semibold text-[0.8125rem] text-grey underline-offset-2 hover:underline"
        >
          Cancel
        </button>
      </div>
    );
  }

  const opening = state.step === 'opening';
  return (
    <div>
      <button
        type="button"
        disabled={disabled || opening}
        onClick={google.start}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[13px] border-[1.6px] border-emphasis font-bold font-head text-[0.9375rem] text-emphasis disabled:opacity-50"
      >
        {opening ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Opening {BROWSER_NAMES[state.browser]}…
          </>
        ) : (
          label
        )}
      </button>
      {problem ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
          {problem}
        </p>
      ) : (
        <p className="mt-1.5 text-center text-[0.78125rem] text-grey leading-[1.45]">
          Opens Chrome or Safari, where your Google accounts are.
        </p>
      )}
    </div>
  );
}
