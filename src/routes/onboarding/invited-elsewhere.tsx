import { useEffect, useState } from 'react';
import { CODE_LENGTH, looksLikeEmail } from '@/lib/auth-email';
import { askForInviteCode, proveInviteCode } from '@/lib/invite-proof';
import { Field, useAutoFocus } from '@/routes/onboarding/chrome';
import { CODE_INPUT } from '@/routes/onboarding/sign-in-steps';

/**
 * On the refused screen: somebody invited at one address, and signed in at
 * another, such as Apple's hidden one (the owner, 2026-11-02; 20261102040000).
 * The address they give is emailed a code, and the code moves the invite to the
 * account they are in. What it says after the address is the same whether or
 * not that address is on the list: nobody learns it from here. The box is
 * there from the start (the owner, 2026-11-02), not behind a button.
 */

const RESEND_WAIT = 60;

export function InvitedElsewhere({ onProved }: { onProved: () => void }) {
  const [address, setAddress] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeRef = useAutoFocus(sentTo !== null);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => {
      setWait((n) => n - 1);
    }, 1000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [wait]);

  async function send(to: string) {
    setBusy(true);
    setError(null);
    const asked = await askForInviteCode(to);
    setBusy(false);
    if (!asked) {
      setError('Could not send that just now. Try again.');
      return;
    }
    setCode('');
    setSentTo(to);
    setWait(RESEND_WAIT);
  }

  async function check(whole: string) {
    setBusy(true);
    setError(null);
    const result = await proveInviteCode(whole);
    setBusy(false);
    if (result === 'proved') {
      onProved();
      return;
    }
    setCode('');
    setError(
      result === 'failed'
        ? 'Could not check that just now. Try again.'
        : 'That code did not work. Check it, or send a new one.',
    );
  }

  if (sentTo === null) {
    return (
      <form
        className="mt-4 rounded-[14px] border border-line bg-paper p-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (looksLikeEmail(address)) void send(address.trim());
        }}
      >
        <label htmlFor="invited-address" className="block font-bold text-[0.8125rem] text-ink">
          Invited at a different email?
        </label>
        <Field
          id="invited-address"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          placeholder="you@example.com"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
          }}
        />
        {error ? (
          <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy || !looksLikeEmail(address)}
          className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-[0.9375rem] text-on-gold disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send a code'}
        </button>
      </form>
    );
  }

  return (
    <div className="mt-4 rounded-[14px] border border-line bg-paper p-3.5">
      <p role="status" className="text-[0.875rem] text-ink2 leading-[1.5]">
        If <b className="break-all text-ink">{sentTo}</b> has an invitation, a {CODE_LENGTH}-digit
        code is on its way. It works for 10 minutes. Look in spam if it does not arrive in a minute.
      </p>
      <label htmlFor="invited-code" className="mt-3 block font-bold text-[0.8125rem] text-ink">
        Code from the email
      </label>
      <input
        ref={codeRef}
        id="invited-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        value={code}
        disabled={busy}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH);
          setCode(next);
          if (next.length === CODE_LENGTH) void check(next);
        }}
        className={CODE_INPUT}
      />
      {error ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy || wait > 0}
        onClick={() => {
          void send(sentTo);
        }}
        className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-[13px] border-[1.6px] border-emphasis font-bold font-head text-[0.9375rem] text-emphasis disabled:opacity-50"
      >
        {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
      </button>
      <button
        type="button"
        onClick={() => {
          setSentTo(null);
          setError(null);
        }}
        className="mt-1 flex min-h-[44px] w-full items-center justify-center font-bold text-[0.875rem] text-emphasis"
      >
        Use a different address
      </button>
    </div>
  );
}
