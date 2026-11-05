import { useId, useState } from 'react';
import { useAnnounce } from '@/lib/announce';
import { confirmEmailCode, sendEmailCode, useUnprovenEmail } from '@/lib/email-proof';

const CODE_LENGTH = 6;

/**
 * "Confirm your email", above Me's tabs (the owner, 2026-11-04), for somebody
 * who joined with an address nothing proved yet. A code typed here, never a
 * link (20261104110000). Gone once it is confirmed.
 */
export function ConfirmEmailBanner() {
  const address = useUnprovenEmail();
  const announce = useAnnounce();
  const id = useId();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!address) return null;

  async function send() {
    setBusy(true);
    setMessage(null);
    const result = await sendEmailCode();
    setBusy(false);
    if (result === 'sent') {
      setSent(true);
      announce(`We emailed a code to ${address ?? 'your address'}.`);
    } else if (result === 'wait') {
      setSent(true);
      setMessage('A code went in the last minute. Wait a minute before asking for another.');
    } else {
      setMessage('The email was not sent. Try again in a minute.');
    }
  }

  async function confirm() {
    const digits = code.replace(/\D/g, '');
    if (digits.length !== CODE_LENGTH) {
      setMessage(`Enter the ${CODE_LENGTH}-digit code from the email.`);
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await confirmEmailCode(digits);
    setBusy(false);
    if (result === 'proved') {
      announce('Your email is confirmed.');
    } else if (result === 'refused') {
      setMessage('That code has expired or is not right. Check it, or send a new one.');
    } else {
      setMessage('That did not go through. Try again in a minute.');
    }
  }

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="border-line border-b bg-gold-lt px-4 py-4 text-gold-ink"
    >
      <div className="mx-auto w-full max-w-[var(--events-measure)]">
        <h2 id={`${id}-heading`} className="font-extrabold font-head text-[1rem]">
          Confirm your email
        </h2>
        <p className="mt-1.5 text-[0.875rem] leading-[1.5]">
          {sent
            ? `We sent a ${CODE_LENGTH}-digit code to ${address}. Check your spam folder if it is not there in a minute.`
            : `So the club knows ${address} is yours, we will email it a ${CODE_LENGTH}-digit code.`}
        </p>
        {sent ? (
          <form
            className="mt-3 flex flex-wrap items-end gap-2.5"
            onSubmit={(event) => {
              event.preventDefault();
              void confirm();
            }}
          >
            <div className="min-w-0 flex-1 basis-[10rem]">
              <label htmlFor={`${id}-code`} className="block font-bold text-[0.8125rem]">
                Code
              </label>
              <input
                id={`${id}-code`}
                value={code}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={CODE_LENGTH + 2}
                onChange={(event) => {
                  setCode(event.target.value);
                }}
                className="mt-1 min-h-[44px] w-full rounded-[11px] border-[1.6px] border-line bg-paper px-3 font-semibold text-[1.0625rem] text-ink tracking-[0.2em] outline-none focus:border-emphasis"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="min-h-[44px] rounded-[11px] bg-action px-4 font-bold font-head text-[0.875rem] text-white hover:bg-action-hi disabled:opacity-50"
            >
              {busy ? 'One moment…' : 'Confirm'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void send();
              }}
              className="min-h-[44px] px-2 font-bold font-head text-[0.875rem] text-emphasis underline disabled:opacity-50"
            >
              Send another code
            </button>
          </form>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void send();
            }}
            className="mt-3 min-h-[44px] rounded-[11px] bg-action px-4 font-bold font-head text-[0.875rem] text-white hover:bg-action-hi disabled:opacity-50"
          >
            {busy ? 'One moment…' : 'Email me a code'}
          </button>
        )}
        {message ? (
          <p role="alert" className="mt-2.5 text-[0.8125rem] text-destructive leading-[1.45]">
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
