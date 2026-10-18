/**
 * Which sign-ins arriving in the address bar the client takes.
 *
 * The client signs in from a `#access_token=…&refresh_token=…` address, as
 * every email link and the Google and Apple redirects bring one back. Nothing
 * ties such an address to a sign-in this browser asked for, so somebody could
 * send a member a link carrying the sender's own tokens, or simply forward a
 * reset link for their own address. Opening it swapped the member's session
 * for the sender's without a word, and whatever the member then wrote, their
 * messages and their health answers, went into the sender's account where the
 * sender could read it (security scan 2026-10-17, F17).
 *
 * So an address's sign-in is refused when a *different* account is already
 * signed in on this device and this tab did not start a sign-in. Everything
 * else is as it was:
 *
 *   - nobody signed in here: taken (an email confirmation, a reset link);
 *   - the same account: taken (a changed address confirmed, Link Apple);
 *   - another account, after this tab pressed Google or Apple: taken, since
 *     that is somebody choosing to switch.
 *
 * PKCE, the other cure, would refuse an email link opened in a different
 * browser from the one it was asked for in, which is how members open them:
 * the mail app picks the browser, and the iPhone Home Screen app is never it.
 *
 * Refused, the member stays who they were, and the tokens are dropped from
 * the address so they do not linger in its history.
 */

const STARTED_KEY = 'club:sign-in-started';
/** How long a pressed Google or Apple button vouches for the address that comes back. */
const STARTED_FOR_MS = 30 * 60_000;

/** Call just before sending this tab to Google or Apple to sign in. */
export function noteSignInStarted(now = Date.now()): void {
  try {
    sessionStorage.setItem(STARTED_KEY, String(now));
  } catch {
    // Storage blocked: an account switch through the redirect is refused,
    // and the member signs out first, as with any other refusal.
  }
}

function takeSignInStarted(now: number): boolean {
  try {
    const at = Number(sessionStorage.getItem(STARTED_KEY));
    sessionStorage.removeItem(STARTED_KEY);
    return at > 0 && now - at < STARTED_FOR_MS;
  } catch {
    return false;
  }
}

/** Where supabase-js keeps the session for this project (its own default). */
export function sessionStorageKey(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

/** The account a token names. Unverified: used only to refuse, never to admit. */
function tokenSubject(token: string): string | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const sub: unknown = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === 'string' ? sub : null;
  } catch {
    return null;
  }
}

/** The account signed in on this device, if any. */
function signedInHere(storageKey: string): string | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const id: unknown = (JSON.parse(raw) as { user?: { id?: unknown } }).user?.id;
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

/**
 * supabase-js's `detectSessionInUrl`: whether this address is a sign-in to
 * take. Its own test first, unchanged, then the one above.
 */
export function acceptSessionFromUrl(
  storageKey: string,
): (url: URL, params: Record<string, string>) => boolean {
  return (url, params) => {
    const callback = [
      params.access_token,
      params.error,
      params.error_description,
      params.error_code,
    ].some(Boolean);
    if (!callback) return false;
    // An error to report, not a session.
    if (!params.access_token) return true;

    const now = Date.now();
    const arriving = tokenSubject(params.access_token);
    const here = signedInHere(storageKey);
    const started = takeSignInStarted(now);
    if (here === null || arriving === null || arriving === here || started) return true;

    try {
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
    } catch {
      // Not in a browser that lets the address change: nothing to tidy.
    }
    return false;
  };
}
