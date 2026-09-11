import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getSupabase } from '@/lib/supabase';

/**
 * A programmatic sign-in, for development.
 *
 * Signed-in surfaces gate on a real Supabase session — `browse_members` is
 * granted to `authenticated` only — and clicking through phone and code screens
 * every time you want to look at the deck is slow.
 *
 * **This is not a bypass.** It makes the same two calls the onboarding wizard
 * makes, `signInWithOtp` then `verifyOtp`, against the same project. A wrong
 * number or a wrong code fails here exactly as it would in the UI, because it
 * is the same credential check. What it skips is the typing, not the auth.
 *
 * It works with the project's configured test numbers, which never dispatch a
 * real SMS. Unlisted — not linked from anywhere in the app.
 *
 *   /dev-login?phone=11111111111&code=111111&next=/peers
 */
export default function DevLoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [status, setStatus] = useState('Signing in…');
  const started = useRef(false);

  const phone = params.get('phone') ?? '';
  const code = params.get('code') ?? '';
  const next = params.get('next') ?? '/peers';

  const run = useCallback(async () => {
    if (!phone || !code) {
      setStatus('Pass ?phone=…&code=… — for example /dev-login?phone=11111111111&code=111111');
      return;
    }
    try {
      const supabase = getSupabase();
      const sent = await supabase.auth.signInWithOtp({ phone });
      if (sent.error) {
        setStatus(`Could not request a code: ${sent.error.message}`);
        return;
      }
      const verified = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
      if (verified.error) {
        setStatus(`Could not verify: ${verified.error.message}`);
        return;
      }
      // react-router v7's navigate returns a promise; we do not need to wait on it.
      void navigate(next, { replace: true });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Sign-in failed.');
    }
  }, [phone, code, next, navigate]);

  useEffect(() => {
    // StrictMode double-invokes effects in development; verifyOtp is not
    // idempotent, so guard rather than burning the code on the first render.
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
