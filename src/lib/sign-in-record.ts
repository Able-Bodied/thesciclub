import type { Session, SupabaseClient } from '@supabase/supabase-js';

/**
 * Tells the club about each new sign-in, for Admin → Stats (20261016000000).
 *
 * Once a session: the watch starts with the client (getSupabase), and the
 * first time it sees a session it has not reported, it asks the database to
 * record it. The database reads how the session began from its own token, so
 * this sends only what a token cannot say: which of Google or Apple, and that
 * the iPhone Home Screen app took a browser's sign-in over. Those are left
 * here as a hint by the code about to sign in (hintSignIn).
 *
 * Nothing waits for it. It runs after the sign-in has finished, a failure is
 * left for the next time the app opens (the database records a session once,
 * at the time it began, however late the report), and a session already
 * reported costs one localStorage read.
 */

const RECORDED = 'club:sign-in-recorded';
const HINT = 'club:sign-in-hint';

/** A hint older than this belongs to a sign-in that never finished. */
export const HINT_LIFE_MS = 15 * 60_000;

export interface SignInHint {
  provider?: 'google' | 'apple';
  homeScreen?: boolean;
}

/** Said just before signing in, for the sign-in that follows. */
export function hintSignIn(hint: SignInHint): void {
  try {
    localStorage.setItem(HINT, JSON.stringify({ ...hint, at: Date.now() }));
  } catch {
    // Private browsing: recorded without it, as the token alone says.
  }
}

function readHint(now: number): SignInHint | null {
  try {
    const value = JSON.parse(localStorage.getItem(HINT) ?? 'null') as
      | (SignInHint & { at?: unknown })
      | null;
    if (typeof value?.at !== 'number' || now - value.at > HINT_LIFE_MS) return null;
    const homeScreen = value.homeScreen === true;
    return value.provider === 'google' || value.provider === 'apple'
      ? { provider: value.provider, homeScreen }
      : { homeScreen };
  } catch {
    return null;
  }
}

function recorded(): string | null {
  try {
    return localStorage.getItem(RECORDED);
  } catch {
    return null;
  }
}

function markRecorded(id: string): void {
  try {
    localStorage.setItem(RECORDED, id);
    localStorage.removeItem(HINT);
  } catch {
    // Reported again next time, which the database ignores.
  }
}

/** The session's id, from its access token. */
export function sessionIdOf(session: Session): string | null {
  try {
    const part = session.access_token.split('.')[1] ?? '';
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const id = (JSON.parse(json) as { session_id?: unknown }).session_id;
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

let reporting: string | null = null;

async function report(client: SupabaseClient, id: string): Promise<void> {
  const hint = readHint(Date.now());
  try {
    const { error } = await client.rpc('record_sign_in', {
      provider_hint: hint?.provider ?? null,
      via_home_screen: hint?.homeScreen ?? false,
    });
    if (!error) markRecorded(id);
  } catch {
    // Offline: the next time the app opens.
  } finally {
    reporting = null;
  }
}

/** Called once, as the client is made. */
export function watchSignIns(client: SupabaseClient): void {
  client.auth.onAuthStateChange((event, session) => {
    if (!session || (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION')) return;
    const id = sessionIdOf(session);
    if (!id || id === reporting || id === recorded()) return;
    reporting = id;
    // After the callback: a Supabase call made inside it waits on the
    // client's own lock, which the callback is holding.
    setTimeout(() => {
      void report(client, id);
    }, 0);
  });
}
