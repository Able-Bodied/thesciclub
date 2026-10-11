import { useState } from 'react';
import { resendEmailChange, type SignInState } from '@/lib/account-email';
import { useAnnounce } from '@/lib/announce';
import { describeThrown } from '@/lib/describe-error';
import { AddEmailForm } from '@/routes/me/add-email-form';

/**
 * "Add an email so you can keep signing in", for accounts that began with a
 * phone number and have no confirmed address.
 *
 * It stays until the address is confirmed, which is why a waiting address
 * keeps it on screen with the link offered again. It shows nothing while the
 * account is being read, and nothing for an account that has an email, so
 * most members never see it.
 */
export function AddEmailBanner({ state, reload }: { state: SignInState; reload: () => void }) {
  const announce = useAnnounce();
  const [again, setAgain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status !== 'ready' || state.details.email) return null;
  const { pendingEmail, googleAddress } = state.details;

  async function resend(address: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await resendEmailChange(address);
      if (result.ok) announce(`We sent the link to ${address} again.`);
      else setError(result.error);
    } catch (e: unknown) {
      setError(describeThrown(e, 'The email was not sent. Try again in a minute.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="add-email-heading"
      className="border-line border-b bg-gold-lt px-4 py-4 text-gold-ink"
    >
      <div className="mx-auto w-full max-w-[var(--events-measure)]">
        <h2 id="add-email-heading" className="font-extrabold font-head text-[1rem]">
          Add an email so you can keep signing in
        </h2>
        {pendingEmail && !again ? (
          <>
            <p role="status" className="mt-1.5 text-[0.875rem] leading-[1.5]">
              We sent a link to {pendingEmail}. Open it to finish. Check your spam folder if it is
              not there in a minute.
            </p>
            <div className="mt-3 flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void resend(pendingEmail);
                }}
                className="min-h-[44px] rounded-[11px] border-[1.6px] border-emphasis px-4 font-bold font-head text-[0.875rem] text-emphasis hover:bg-tint disabled:opacity-50"
              >
                {busy ? 'One moment…' : 'Send the link again'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAgain(true);
                }}
                className="min-h-[44px] px-2 font-bold font-head text-[0.875rem] text-emphasis underline"
              >
                Use a different address
              </button>
            </div>
            {error ? (
              <p role="alert" className="mt-2.5 text-[0.8125rem] text-destructive">
                {error}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p className="mt-1.5 mb-3 text-[0.875rem] leading-[1.5]">
              The club no longer sends codes by text message. Add an email, and a password, and you
              will sign in with those. Your account and everything on it stay as they are.
            </p>
            <AddEmailForm
              googleAddress={googleAddress}
              onSent={() => {
                setAgain(false);
                reload();
              }}
            />
          </>
        )}
      </div>
    </section>
  );
}
