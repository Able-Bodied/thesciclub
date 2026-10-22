import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { watchForAppleRefreshToken } from '@/lib/apple-web-token';
import { watchForRecoveryLink } from '@/lib/recovery-link';
import { watchSignIns } from '@/lib/sign-in-record';
import { acceptSessionFromUrl, sessionStorageKey } from '@/lib/url-session';

/**
 * The one Supabase client.
 *
 * Created lazily rather than at module load so that importing anything that
 * touches this file — a test, a pure helper — does not require the environment
 * to be configured. A missing URL or key is thrown at the point of use, where
 * the message can say which variable is missing, rather than at import time
 * where it surfaces as an unrelated module failing to load.
 */

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.',
    );
  }

  // A sign-in in the address is not taken over another account's session
  // (src/lib/url-session.ts). Passkeys are a Supabase beta behind
  // VITE_PASSKEYS (src/lib/passkeys.ts).
  const detectSessionInUrl = acceptSessionFromUrl(sessionStorageKey(url));
  client = import.meta.env.VITE_PASSKEYS
    ? createClient(url, key, { auth: { detectSessionInUrl, experimental: { passkey: true } } })
    : createClient(url, key, { auth: { detectSessionInUrl } });
  // Before the client's first await, so a reset link it reads is seen.
  watchForRecoveryLink(client);
  // Likewise, so the session it reads from the address is reported, and
  // Apple's refresh token on it kept for revoking.
  watchSignIns(client);
  watchForAppleRefreshToken(client);
  return client;
}
