import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

  client = createClient(url, key);
  return client;
}
