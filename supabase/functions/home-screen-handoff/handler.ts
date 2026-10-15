/**
 * The rules of home-screen-handoff, with the two outside calls passed in so
 * they can be tested.
 */

export interface Deps {
  /** Uses the code up; the account's confirmed address, or null for any refusal. */
  redeem: (code: string) => Promise<string | null>;
  /**
   * Uses up the sign-in a browser left for this secret (20261015010000); the
   * address, or null for one not left yet, used or expired.
   */
  redeemPairing: (secret: string) => Promise<string | null>;
  /** A one-time sign-in for that address, as a token hash; nothing is emailed. */
  signInHash: (email: string) => Promise<string | null>;
}

export interface Reply {
  status: number;
  body: Record<string, unknown>;
}

/**
 * What issue_home_screen_handoff makes, and the secret the app keeps for a
 * pairing (src/lib/google-in-browser.ts): 32 random bytes, base64url, no padding.
 */
const CODE = /^[A-Za-z0-9_-]{43}$/;

/**
 * `{ code }`: the cookie iOS copied in when the app was added.
 * `{ pairing }`: the app's secret, for the sign-in Chrome or Safari left it.
 */
export async function handOff(payload: unknown, deps: Deps): Promise<Reply> {
  // Malformed, unknown, used and expired all answer alike: nothing to learn.
  // A pairing not filled yet answers the same; the app asks again.
  const gone: Reply = { status: 404, body: { error: 'That sign-in has expired. Sign in here.' } };
  const given = payload as { code?: unknown; pairing?: unknown } | null;
  const code = given?.code;
  const pairing = given?.pairing;
  let email: string | null;
  if (typeof code === 'string' && CODE.test(code)) email = await deps.redeem(code);
  else if (typeof pairing === 'string' && CODE.test(pairing))
    email = await deps.redeemPairing(pairing);
  else return gone;
  if (!email) return gone;

  const tokenHash = await deps.signInHash(email);
  if (!tokenHash) return { status: 502, body: { error: 'Could not sign you in. Sign in here.' } };
  return { status: 200, body: { token_hash: tokenHash } };
}
