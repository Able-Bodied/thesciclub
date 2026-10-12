/**
 * The rules of home-screen-handoff, with the two outside calls passed in so
 * they can be tested.
 */

export interface Deps {
  /** Uses the code up; the account's confirmed address, or null for any refusal. */
  redeem: (code: string) => Promise<string | null>;
  /** A one-time sign-in for that address, as a token hash; nothing is emailed. */
  signInHash: (email: string) => Promise<string | null>;
}

export interface Reply {
  status: number;
  body: Record<string, unknown>;
}

/** What issue_home_screen_handoff makes: 32 random bytes, base64url, no padding. */
const CODE = /^[A-Za-z0-9_-]{43}$/;

export async function handOff(payload: unknown, deps: Deps): Promise<Reply> {
  // Malformed, unknown, used and expired all answer alike: nothing to learn.
  const gone: Reply = { status: 404, body: { error: 'That sign-in has expired. Sign in here.' } };
  const code = (payload as { code?: unknown } | null)?.code;
  if (typeof code !== 'string' || !CODE.test(code)) return gone;

  const email = await deps.redeem(code);
  if (!email) return gone;

  const tokenHash = await deps.signInHash(email);
  if (!tokenHash) return { status: 502, body: { error: 'Could not sign you in. Sign in here.' } };
  return { status: 200, body: { token_hash: tokenHash } };
}
