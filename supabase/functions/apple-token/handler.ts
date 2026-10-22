/**
 * The rules of apple-token, with every outside thing passed in so they can
 * be tested.
 *
 * `{ code }`: the authorization code a native Sign in with Apple gave the
 * store app, exchanged once (it lasts five minutes) as com.thesciclub.app.
 * `{ refresh_token }`: the one Supabase handed the website after Apple's
 * redirect, checked with Apple as com.thesciclub.web.
 *
 * Apple's answer carries an ID token whose `sub` must be one of the caller's
 * own Apple identities before anything is kept. Should a refresh check come
 * back without one, the token is kept only for an account with a single
 * Apple identity.
 */

import {
  APPLE_APP_CLIENT,
  APPLE_WEB_CLIENT,
  type AppleAnswer,
  type AppleClient,
  appleError,
  jwtClaims,
} from '../_shared/apple.ts';

export interface Caller {
  id: string;
  /** The `sub` of each Apple identity on the account. */
  appleSubs: string[];
}

export interface Deps {
  /** The signed-in caller for this bearer token, or null. */
  caller(jwt: string): Promise<Caller | null>;
  /** POSTs the form, with client_id and client_secret added, to Apple's token endpoint. */
  askApple(client: AppleClient, form: Record<string, string>): Promise<AppleAnswer>;
  keep(userId: string, sub: string, client: AppleClient, refreshToken: string): Promise<boolean>;
  log(message: string): void;
}

export interface Reply {
  status: number;
  body: Record<string, unknown>;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' && value.length < 4096
    ? value.trim()
    : null;
}

export async function keepAppleToken(
  bearer: string | null,
  payload: unknown,
  deps: Deps,
): Promise<Reply> {
  const jwt = bearer?.replace(/^Bearer\s+/i, '').trim();
  const caller = jwt ? await deps.caller(jwt) : null;
  if (!caller) return { status: 401, body: { error: 'Sign in first.' } };

  const given = (payload ?? {}) as { code?: unknown; refresh_token?: unknown };
  const code = text(given.code);
  const refresh = text(given.refresh_token);
  if (!code === !refresh) {
    return { status: 400, body: { error: 'Send code or refresh_token.' } };
  }
  if (caller.appleSubs.length === 0) {
    return { status: 409, body: { error: 'This account has no Apple sign-in.' } };
  }

  const client: AppleClient = code ? APPLE_APP_CLIENT : APPLE_WEB_CLIENT;
  const answer = await deps.askApple(
    client,
    code
      ? { grant_type: 'authorization_code', code }
      : { grant_type: 'refresh_token', refresh_token: refresh ?? '' },
  );
  if (answer.status !== 200) {
    deps.log(`apple-token: Apple refused ${client}: ${appleError(answer)}`);
    return { status: 502, body: { error: 'Apple did not accept it.' } };
  }

  const kept = code ? text(answer.body.refresh_token) : refresh;
  const claims = jwtClaims(answer.body.id_token);
  // A refresh token checked without an ID token back: it came from this
  // session's own redirect, so it is the account's one Apple identity's.
  const onlySub = !code && !claims && caller.appleSubs.length === 1 ? caller.appleSubs[0] : null;
  const sub = claims ? claims.sub : onlySub;
  if (!kept || typeof sub !== 'string' || (claims && claims.aud !== client)) {
    deps.log(`apple-token: Apple's answer for ${client} had no refresh token or ID token`);
    return { status: 502, body: { error: 'Apple did not accept it.' } };
  }
  // Somebody else's Apple sign-in must never be kept against this account.
  if (!caller.appleSubs.includes(sub)) {
    return { status: 403, body: { error: 'That Apple sign-in is not this account’s.' } };
  }

  if (!(await deps.keep(caller.id, sub, client, kept))) {
    return { status: 409, body: { error: 'This account has no Apple sign-in.' } };
  }
  return { status: 200, body: { kept: true } };
}
