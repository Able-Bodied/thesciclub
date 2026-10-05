import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAnnounce } from '@/lib/announce';
import { describeThrown } from '@/lib/describe-error';
import { deleteConversation } from '@/routes/chat/delete-conversation-api';

/**
 * "Delete this conversation", under a conversation whose other member has
 * deleted their account (the owner, 2026-10-05). Only there: one with
 * somebody still in the club is half theirs, and the database refuses it.
 *
 * Two presses, as "Delete my account" is, and for the same reasons: the first
 * opens the explanation in place and takes a screen reader to its heading,
 * and "Keep it" is as large as the button that deletes.
 */
export function DeleteConversation({ threadId }: { threadId: string }) {
  const announce = useAnnounce();
  const navigate = useNavigate();
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

  function confirm() {
    setBusy(true);
    setError(null);
    deleteConversation(threadId)
      .then((result) => {
        if (!result.ok) {
          setError(result.error ?? 'The conversation was not deleted.');
          setBusy(false);
          return;
        }
        // Said above the routes, so it is still heard on the list it goes to.
        announce('The conversation is deleted.');
        void navigate('/chat', { replace: true });
      })
      .catch((e: unknown) => {
        setError(describeThrown(e, 'The conversation was not deleted.'));
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
        className="mx-auto mt-1.5 flex min-h-[44px] items-center justify-center rounded-[13px] px-4 font-bold font-head text-[0.875rem] text-destructive transition-colors hover:bg-destructive/10"
      >
        Delete this conversation
      </button>
    );
  }

  return (
    <section
      aria-labelledby="delete-conversation-heading"
      className="mx-auto mt-3 w-full max-w-[720px] rounded-[17px] border-[1.6px] border-destructive/40 bg-paper p-4 text-left"
    >
      <h2
        id="delete-conversation-heading"
        ref={heading}
        tabIndex={-1}
        className="font-extrabold font-head text-[1.0625rem] text-ink outline-none"
      >
        Delete this conversation?
      </h2>
      <p className="mt-2 text-[0.875rem] text-ink2 leading-[1.55]">
        Every message in it goes, yours and theirs, with every photograph. Nobody else can see it:
        the other member deleted their account.
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
          {busy ? 'Deleting…' : 'Delete conversation'}
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
          Keep it
        </button>
      </div>
    </section>
  );
}
