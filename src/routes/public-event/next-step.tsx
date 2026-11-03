import { useState } from 'react';
import type { NextStep } from '@/lib/event-audience';
import { requestClubInvite } from '@/lib/invite-requests';

/**
 * After registering for a public event (the owner, 2026-11-02;
 * 20261102060000): a member is asked to sign in, somebody invited to create
 * the account, anybody else to ask for an invite in one tap with what they
 * typed already. What they typed is kept on this device either way, so the
 * sign-in and join forms start filled in.
 */

const BUTTON =
  'mt-5 flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-[0.9375rem] text-on-gold disabled:opacity-50';

export function NextStepScreen({
  step,
  name,
  email,
  eventTitle,
  onSignIn,
  onCreate,
}: {
  step: NextStep;
  name: string;
  email: string;
  eventTitle: string;
  onSignIn: () => void;
  onCreate: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    setSending(true);
    setError(null);
    const result = await requestClubInvite({
      name,
      email,
      note: `Registered for ${eventTitle}`.slice(0, 500),
    });
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  return (
    <section className="mt-4">
      <p
        role="status"
        className="rounded-[13px] border-gold border-l-4 bg-gold-lt px-3.5 py-3 text-[0.875rem] text-ink leading-[1.45]"
      >
        <b className="font-extrabold font-head">You're on the list</b> for {eventTitle}.
      </p>

      {/* Short (the owner, 2026-11-02). */}
      {step === 'member' ? (
        <>
          <p className="mt-4 text-[0.9375rem] text-ink2 leading-[1.5]">
            Sign in to join the group chat.
          </p>
          <button type="button" onClick={onSignIn} className={BUTTON}>
            Sign in
          </button>
        </>
      ) : null}

      {step === 'invited' ? (
        <>
          <h2 className="mt-5 font-extrabold font-head text-[1.0625rem] text-ink">
            Create your SCI Club account
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.9375rem] text-ink2 leading-[1.5]">
            <li>See who else is coming</li>
            <li>Join the chat for this event</li>
            <li>Meet peers and mentors near you</li>
          </ul>
          <p className="mt-3 text-[0.8125rem] text-grey leading-[1.45]">
            Your name and email are filled in already.
          </p>
          <button type="button" onClick={onCreate} className={BUTTON}>
            Create my account
          </button>
          <button
            type="button"
            onClick={onSignIn}
            className="mt-1 flex min-h-[44px] w-full items-center justify-center font-bold text-[0.875rem] text-emphasis"
          >
            I already have an account
          </button>
        </>
      ) : null}

      {step === 'request' ? (
        sent ? (
          <div role="status" className="mt-4 rounded-[14px] border border-line bg-paper p-4">
            <p className="font-extrabold font-head text-[0.9375rem] text-ink">Request sent</p>
            <p className="mt-1.5 text-[0.875rem] text-ink2 leading-[1.5]">
              If you are invited, the invitation comes to{' '}
              <b className="break-all text-ink">{email}</b>.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-4 text-[0.9375rem] text-ink2 leading-[1.5]">
              With an SCI Club account you can see who else is coming and join the chat. Joining is
              by invitation: ask for one as <b className="text-ink">{name}</b>,{' '}
              <b className="break-all text-ink">{email}</b>.
            </p>
            {error ? (
              <p role="alert" className="mt-3 text-[0.8125rem] text-destructive">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              disabled={sending}
              onClick={() => {
                void ask();
              }}
              className={BUTTON}
            >
              {sending ? 'Sending…' : 'Request an invite'}
            </button>
            <button
              type="button"
              onClick={onSignIn}
              className="mt-1 flex min-h-[44px] w-full items-center justify-center font-bold text-[0.875rem] text-emphasis"
            >
              I already have an account
            </button>
          </>
        )
      ) : null}
    </section>
  );
}
