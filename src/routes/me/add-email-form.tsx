import { useId, useState } from 'react';
import { addEmailAndPassword, changeEmail } from '@/lib/account-email';
import { useAnnounce } from '@/lib/announce';
import { looksLikeEmail, MIN_PASSWORD } from '@/lib/auth-email';
import { describeThrown } from '@/lib/describe-error';
import {
  CARD_BUTTON,
  CardError,
  FIELD,
  FIELD_LABEL,
  PRIMARY_BUTTON,
} from '@/routes/me/sign-in-card';

/**
 * An address (and a password) for an account that has none confirmed.
 *
 * Used by the banner at the top of Me and by the email card, so there is one
 * form. `googleAddress` adds the one-tap choice for an account that already
 * has Google linked: linking Google does not fill in the account's email, and
 * typing an address that is already in front of them is a chance to mistype it.
 * Either way the address is not theirs until its link is opened.
 */
export function AddEmailForm({
  googleAddress,
  onSent,
}: {
  googleAddress: string | null;
  /** The link has gone; the caller reads the account again. */
  onSent: () => void;
}) {
  const announce = useAnnounce();
  const emailId = useId();
  const passwordId = useId();
  const againId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailOk = looksLikeEmail(email);
  const passwordOk = password.length >= MIN_PASSWORD;
  const mismatch = again !== '' && password !== again;
  const ready = emailOk && passwordOk && password === again;

  async function run(work: () => ReturnType<typeof changeEmail>, sentence: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await work();
      if (result.ok) {
        announce(sentence);
        onSent();
      } else setError(result.error);
    } catch (e: unknown) {
      setError(describeThrown(e, 'The address was not added. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {googleAddress ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void run(() => changeEmail(googleAddress), `We sent a link to ${googleAddress}.`);
            }}
            className={PRIMARY_BUTTON}
          >
            {busy ? 'One moment…' : `Use my Google address (${googleAddress})`}
          </button>
          <p className="mt-3 text-[0.8125rem] text-ink2 leading-[1.45]">
            Or use a different address, with a password:
          </p>
        </>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || !ready) return;
          void run(
            () => addEmailAndPassword(email, password),
            `We sent a link to ${email.trim()}.`,
          );
        }}
      >
        <label htmlFor={emailId} className={FIELD_LABEL}>
          Email
        </label>
        <input
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          className={FIELD}
        />
        <label htmlFor={passwordId} className={FIELD_LABEL}>
          Password
        </label>
        <input
          id={passwordId}
          type="password"
          autoComplete="new-password"
          value={password}
          aria-describedby={`${passwordId}-hint`}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          className={FIELD}
        />
        <p id={`${passwordId}-hint`} className="mt-1 text-[0.78125rem] text-grey">
          At least {MIN_PASSWORD} characters.
        </p>
        <label htmlFor={againId} className={FIELD_LABEL}>
          Type it again
        </label>
        <input
          id={againId}
          type="password"
          autoComplete="new-password"
          value={again}
          onChange={(event) => {
            setAgain(event.target.value);
          }}
          className={FIELD}
        />
        {mismatch ? (
          <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
            The two passwords do not match.
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy || !ready}
          className={googleAddress ? CARD_BUTTON : PRIMARY_BUTTON}
        >
          {busy ? 'One moment…' : 'Add email'}
        </button>
      </form>
      {error ? <CardError>{error}</CardError> : null}
    </div>
  );
}
