import type { Account } from '@/lib/account';

/** A failed membership read cannot tell us whether someone needs to join. */
export function AccountProblem({ account }: { account: Account }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-6 text-center">
      <h1 className="font-bold font-head text-[1.25rem] text-ink">Could not open the club</h1>
      <p role="alert" className="mt-3 max-w-[30em] text-ink2">
        Check your connection and try again. Your sign-in is still saved.
      </p>
      <button
        type="button"
        onClick={account.retry}
        className="mt-5 min-h-[44px] rounded-full bg-action px-6 py-3 font-bold text-white"
      >
        Try again
      </button>
    </main>
  );
}
