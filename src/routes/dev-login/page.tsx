import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getSupabase } from '@/lib/supabase';

/**
 * A programmatic sign-in, for development.
 *
 * Signed-in surfaces gate on a real Supabase session — `browse_members` is
 * granted to `authenticated` only — and typing an address and password every
 * time you want to look at the deck is slow.
 *
 * **This is not a bypass.** It makes the same call the sign-in screen makes,
 * `signInWithPassword`, against the same project. A wrong address or password
 * fails here exactly as it would in the UI, because it is the same credential
 * check. What it skips is the typing, not the auth.
 *
 * It works with the accounts supabase/seed.sql makes on the local stack, all
 * with the password `local-dev-password`: `alfred@local.test` (administrator),
 * `maya@local.test` (mentor), `sam@local.test`, `invited@local.test` (invited,
 * not yet a member) and `stranger@local.test` (not invited). Unlisted — not
 * linked from anywhere in the app, and left out of a production build.
 *
 * One more, `14155550199`, is a phone-only member with no email, like the live
 * club's members from before email sign-in: `/dev-login?phone=14155550199`.
 * The same password call with a phone in place of an address.
 *
 *   /dev-login?email=alfred@local.test&next=/peers
 *   /dev-login?email=maya@local.test&password=local-dev-password
 *   /dev-login?phone=14155550199&next=/me
 */
const SEEDED_PASSWORD = 'local-dev-password';

export default function DevLoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [status, setStatus] = useState('Signing in…');
  const started = useRef(false);

  const email = params.get('email') ?? '';
  const phone = params.get('phone') ?? '';
  const password = params.get('password') ?? SEEDED_PASSWORD;
  // Where the app opens, as `/` does, unless told otherwise.
  const next = params.get('next') ?? '/home';

  const run = useCallback(async () => {
    if (!email && !phone) {
      setStatus('Pass ?email=… — for example /dev-login?email=alfred@local.test');
      return;
    }
    try {
      const { error } = await getSupabase().auth.signInWithPassword(
        email ? { email, password } : { phone, password },
      );
      if (error) {
        setStatus(`Could not sign in: ${error.message}`);
        return;
      }
      // react-router v7's navigate returns a promise; we do not need to wait on it.
      void navigate(next, { replace: true });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Sign-in failed.');
    }
  }, [email, phone, password, next, navigate]);

  useEffect(() => {
    // StrictMode double-invokes effects in development; sign-in once rather
    // than twice on the first render.
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-8">
      <p className="text-center text-[0.875rem] text-ink2 leading-relaxed">{status}</p>
    </div>
  );
}
