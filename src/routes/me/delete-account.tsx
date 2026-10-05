import { useEffect, useRef, useState } from 'react';
import { useAnnounce } from '@/lib/announce';
import { describeThrown } from '@/lib/describe-error';
import { deleteMyAccount } from '@/routes/me/delete-account-api';

/**
 * "Delete my account", at the foot of Me.
 *
 * Two presses, and the second is after reading what happens. The first opens
 * the explanation in place rather than in a sheet: it is a paragraph and two
 * buttons, and a member reading it with a screen reader is taken to its
 * heading, from which everything else follows in order. "Keep my account" is
 * as large as the other button, so backing out is never the harder thing.
 *
 * An administrator is told why there is no button, rather than given one the
 * database refuses (20261003080000: no administrator is removed from the app).
 */
export function DeleteAccount({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const announce = useAnnounce();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (asking) heading.current?.focus();
    // Back to the button that opened it, once it closes — not on first render.
    else if (opened.current) opener.current?.focus();
    opened.current = asking;
  }, [asking]);

  if (isAdmin) {
    return (
      <p className="mt-6 text-[0.8125rem] text-grey leading-[1.5]">
        An administrator’s account cannot be deleted from the app. Ask another administrator.
      </p>
    );
  }

  function confirm() {
    setBusy(true);
    setError(null);
    deleteMyAccount(userId)
      .then((result) => {
        if (!result.ok) {
          setError(result.error ?? 'Your account was not deleted.');
          return;
        }
        // Said above the routes, so it is still heard on the welcome screen
        // the signed-out guard goes to next.
        announce('Your account is deleted.');
      })
      .catch((e: unknown) => {
        setError(describeThrown(e, 'Your account was not deleted.'));
      })
      .finally(() => {
        setBusy(false);
      });
  }

  if (!asking) {
    return (
      <button
        ref={opener}
        type="button"
        onClick={() => {
          setAsking(true);
        }}
        className="mt-6 flex min-h-[48px] w-full items-center justify-center rounded-[13px] font-bold font-head text-[0.9375rem] text-destructive transition-colors hover:bg-destructive/10"
      >
        Delete my account
      </button>
    );
  }

  return (
    <section
      aria-labelledby="delete-account-heading"
      className="mt-6 rounded-[17px] border-[1.6px] border-destructive/40 bg-paper p-4"
    >
      <h2
        id="delete-account-heading"
        ref={heading}
        tabIndex={-1}
        className="font-extrabold font-head text-[1.0625rem] text-ink outline-none"
      >
        Delete your account?
      </h2>
      <p className="mt-2 text-[0.875rem] text-ink2 leading-[1.55]">
        This erases your name, phone number, photo, birthday, injury details and everything you told
        the club about yourself. Your number comes off the club’s list, so coming back would take a
        new invite.
      </p>
      <p className="mt-2 text-[0.875rem] text-ink2 leading-[1.55]">
        What you wrote in Chat stays, so other people’s conversations still make sense, but it will
        say “Deleted member” instead of your name.
      </p>
      <p className="mt-2 font-bold text-[0.875rem] text-ink">This cannot be undone.</p>

      {error ? (
        <p role="alert" className="mt-3 text-[0.8125rem] text-destructive leading-[1.45]">
          {error}
        </p>
      ) : null}

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <button
          type="button"
          onClick={confirm}
          disabled={busy}
          className="flex min-h-[48px] items-center justify-center rounded-[13px] bg-destructive-fill font-bold font-head text-[0.9375rem] text-white disabled:opacity-50"
        >
          {busy ? 'Deleting…' : 'Delete my account'}
        </button>
        <button
          type="button"
          onClick={() => {
            setAsking(false);
            setError(null);
          }}
          disabled={busy}
          className="flex min-h-[48px] items-center justify-center rounded-[13px] border-[1.6px] border-emphasis font-bold font-head text-[0.9375rem] text-emphasis disabled:opacity-50"
        >
          Keep my account
        </button>
      </div>
    </section>
  );
}
