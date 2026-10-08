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

/**
 * Link Google, so the sign-in screen's Google button opens this account.
 *
 * The phone number stays: it is the account, and unlinking Google leaves it,
 * so nobody can be left with no way in. See src/lib/google-sign-in.ts.
 *
 * Linking leaves the app for Google and comes back here with `?google=linked`.
 * That return says nothing about whether it worked — pressing Cancel at Google
 * comes back the same way — so the identity is read again and the sentence is
 * chosen from what is actually there.
 */
export function GoogleSignIn() {
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
          if (result.identity) announce('Google is linked.');
          else
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
  }, [returned, announce, setParams]);

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
      } else setError(result.error);
    } catch (e: unknown) {
      setError(describeThrown(e, 'Google is still linked.'));
    } finally {
      setBusy(false);
    }
  }

  if (identity === undefined) return null;
  const email = identity ? googleEmail(identity) : null;

  return (
    <section aria-labelledby="google-sign-in-heading" className="mt-6">
      <h2
        id="google-sign-in-heading"
        className="mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]"
      >
        Signing in
      </h2>

      <div className="rounded-[17px] border border-line bg-paper p-3.5">
        <p aria-live="polite" className="text-[0.875rem] text-ink2 leading-[1.45]">
          {identity
            ? `You can sign in with Google${email ? ` as ${email}` : ''}, or with your phone number.`
            : 'You sign in with your phone number. Link Google to sign in with it instead, without waiting for a code.'}
        </p>

        {identity ? (
          <button
            type="button"
            onClick={() => {
              void unlink(identity);
            }}
            disabled={busy}
            className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[11px] border-[1.6px] border-emphasis font-bold font-head text-[0.875rem] text-emphasis transition-colors hover:bg-tint disabled:opacity-50"
          >
            {busy ? 'One moment…' : 'Unlink Google'}
          </button>
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
      </div>
    </section>
  );
}
