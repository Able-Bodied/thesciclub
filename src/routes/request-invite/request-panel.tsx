import { type ReactNode, useState } from 'react';
import { pendingRegistration } from '@/lib/event-audience';
import { requestClubInvite } from '@/lib/invite-requests';

/**
 * Asking for an invite: name, email, an optional note, sent to one person at
 * The SCI Club (the owner, 2026-11-02: "get rid of all the different options
 * for now, just have the request sent to me"; 20261102050000). The list of
 * organizations and their org admins (20261029030000, InviteChoiceList) is
 * set aside, not gone.
 *
 * On /request-invite, and on the blocked screen with the refused address
 * filled in. Otherwise the name and email start from an event registration on
 * this device, if there is one (the owner, 2026-11-02).
 *
 * "Sent" is said the same whatever happens to the address afterwards, so it
 * never tells anybody whether an email is a member's, invited or blocked.
 */

const FIELD =
  'mt-1.5 w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-3 text-[1rem] text-ink outline-none focus:border-emphasis';
const LABEL = 'mt-4 block font-bold text-[0.8125rem] text-ink';

export function InviteRequestPanel({
  initialName = '',
  initialEmail = '',
  done = null,
}: {
  /** The name Google or Apple gave, or one typed already. */
  initialName?: string;
  /** The address they tried, on the blocked screen. */
  initialEmail?: string;
  /** Under "Request sent": a way on, where there is one. */
  done?: ReactNode;
}) {
  const [name, setName] = useState(() => initialName || (pendingRegistration()?.name ?? ''));
  const [email, setEmail] = useState(() => initialEmail || (pendingRegistration()?.email ?? ''));
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const ready = name.trim() !== '' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  async function submit() {
    if (!ready || sending) return;
    setSending(true);
    setError(null);
    const result = await requestClubInvite({ name, email, note });
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div role="status" className="mt-4 rounded-[14px] border border-line bg-paper p-4">
        <p className="font-extrabold font-head text-[0.9375rem] text-ink">Request sent</p>
        <p className="mt-1.5 text-[0.875rem] text-ink2 leading-[1.5]">
          If you are invited, the invitation comes to <b className="text-ink">{email.trim()}</b>.
        </p>
        {done}
      </div>
    );
  }

  return (
    <form
      className="mt-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="text-[0.9375rem] text-ink2 leading-[1.5]">
        <b className="text-ink">Joining The SCI Club is by invitation only.</b>
      </p>
      <label htmlFor="request-name" className={LABEL}>
        Your name
      </label>
      <input
        id="request-name"
        autoComplete="name"
        maxLength={100}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
        className={FIELD}
      />
      <label htmlFor="request-email" className={LABEL}>
        Email
      </label>
      <input
        id="request-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        maxLength={254}
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
        }}
        className={FIELD}
      />
      <label htmlFor="request-note" className={LABEL}>
        A note (optional)
      </label>
      <textarea
        id="request-note"
        rows={3}
        maxLength={500}
        placeholder="How you heard about the club"
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
        }}
        className={FIELD}
      />
      <p className="mt-2 text-[0.78125rem] text-grey leading-[1.45]">
        The SCI Club sees your name, email and note, only to decide whether to invite you.
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-[0.8125rem] text-destructive">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!ready || sending}
        className="mt-5 flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-[0.9375rem] text-on-gold disabled:opacity-50"
      >
        {sending ? 'Sending…' : 'Send request'}
      </button>
    </form>
  );
}
