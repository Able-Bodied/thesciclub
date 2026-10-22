import type { UserIdentity } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GoogleButton } from '@/components/google-button';
import { useAnnounce } from '@/lib/announce';
import { describeThrown } from '@/lib/describe-error';
import {
  GOOGLE_RETURN_PARAM,
  googleEmail,
  linkGoogle,
  linkGoogleToken,
  loadGoogleIdentity,
  unlinkGoogle,
} from '@/lib/google-sign-in';
import { isNative } from '@/lib/standalone';
import { CARD_BUTTON, SignInCard } from '@/routes/me/sign-in-card';

/**
 * Link Google, so the sign-in screen's Google button opens this account.
 *
 * Google is one way in among several (the email card, Apple, a passkey), and
 * Unlink is offered only while another remains: `canUnlink` comes from
 * `waysIn` in src/lib/account-email.ts, which does not count a phone number.
 * See src/lib/google-sign-in.ts.
 *
 * Linking leaves the app for Google and comes back here with `?google=linked`.
 * That return says nothing about whether it worked — pressing Cancel at Google
 * comes back the same way — so the identity is read again and the sentence is
 * chosen from what is actually there.
 */
export function GoogleSignIn({
  canUnlink,
  onChanged,
}: {
  /** Another way in would remain. False until the account has been read. */
  canUnlink: boolean;
  /** Linked or unlinked: the account is read again. */
  onChanged: () => void;
}) {
  const announce = useAnnounce();
  const [params, setParams] = useSearchParams();
  // Read once: the parameter is taken off the address below, and the answer
  // to it must not be lost with it.
  const [returned] = useState(() => params.get(GOOGLE_RETURN_PARAM) === 'linked');
  const [identity, setIdentity] = useState<UserIdentity | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadGoogleIdentity()
      .catch((e: unknown) => ({
        ok: false as const,
        error: describeThrown(e, 'Could not check your sign-in.'),
      }))
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setIdentity(null);
          setError(result.error);
          return;
        }
        setIdentity(result.identity);
        if (returned) {
          if (result.identity) {
            announce('Google is linked.');
            onChanged();
          } else
            setError(
              'Google was not linked. If that Google account already signs in to another member, use a different one.',
            );
          // Once, not on every visit to Me.
          setParams(
            (p) => {
              p.delete(GOOGLE_RETURN_PARAM);
              return p;
            },
            { replace: true },
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [returned, announce, setParams, onChanged]);

  async function link() {
    setBusy(true);
    setError(null);
    try {
      const result = await linkGoogle();
      // On success the page is already on its way to Google.
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
      }
    } catch (e: unknown) {
      setError(describeThrown(e, 'Could not reach Google.'));
      setBusy(false);
    }
  }

  /** Google's widget picked an account: link it here, without leaving Me. */
  async function linkWithToken(token: string, nonce: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await linkGoogleToken(token, nonce);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const reread = await loadGoogleIdentity();
      if (reread.ok && reread.identity) {
        setIdentity(reread.identity);
        announce('Google is linked.');
        onChanged();
      } else setError(reread.ok ? 'Google was not linked.' : reread.error);
    } catch (e: unknown) {
      setError(describeThrown(e, 'Google was not linked.'));
    } finally {
      setBusy(false);
    }
  }

  async function unlink(current: UserIdentity) {
    setBusy(true);
    setError(null);
    try {
      const result = await unlinkGoogle(current);
      if (result.ok) {
        setIdentity(null);
        announce('Google is no longer linked.');
        onChanged();
      } else setError(result.error);
    } catch (e: unknown) {
      setError(describeThrown(e, 'Google is still linked.'));
    } finally {
      setBusy(false);
    }
  }

  if (identity === undefined) return null;
  // Linking leaves for Google, which cannot come back into the store app.
  if (!identity && isNative()) return null;
  const email = identity ? googleEmail(identity) : null;

  return (
    <SignInCard title="Google">
      <p aria-live="polite" className="text-[0.875rem] text-ink2 leading-[1.45]">
        {identity
          ? `You can sign in with Google${email ? ` as ${email}` : ''}.${
              canUnlink
                ? ''
                : ' It is your only way in, so add an email and password before you unlink it.'
            }`
          : 'Link Google to sign in with it in one tap, without typing a password.'}
      </p>

      {identity ? (
        canUnlink ? (
          <button
            type="button"
            onClick={() => {
              void unlink(identity);
            }}
            disabled={busy}
            className={CARD_BUTTON}
          >
            {busy ? 'One moment…' : 'Unlink Google'}
          </button>
        ) : null
      ) : (
        <div className="mt-3">
          <GoogleButton
            text="continue_with"
            disabled={busy}
            fallbackLabel="Link Google"
            onToken={(token, nonce) => {
              void linkWithToken(token, nonce);
            }}
            onFallback={() => {
              void link();
            }}
          />
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-2.5 text-[0.8125rem] text-destructive leading-[1.45]">
          {error}
        </p>
      ) : null}
    </SignInCard>
  );
}
