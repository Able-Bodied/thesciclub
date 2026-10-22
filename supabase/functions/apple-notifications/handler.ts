/**
 * The rules of apple-notifications: Apple's server-to-server notices for Sign
 * in with Apple arrive as `{ payload: <JWT> }`, signed with one of Apple's
 * published keys (RS256). Nothing is believed until the signature checks
 * against those keys, the issuer is Apple and the audience is one of the
 * club's two clients. Then the event is handed to apple_notification_record
 * (20261022170000), which decides what to keep.
 */

import { APPLE_ISSUER, fromBase64url, isAppleClient } from '../_shared/apple.ts';

export interface AppleJwk extends JsonWebKey {
  kid?: string;
}

export interface Deps {
  /** Apple's public keys; `fresh` skips any cache, for a key Apple just added. */
  keys(fresh: boolean): Promise<AppleJwk[]>;
  /** Whether a notice was kept; null when the database could not be reached. */
  record(sub: string, kind: string, email: string | null): Promise<boolean | null>;
  nowSeconds(): number;
  log(message: string): void;
}

export interface Reply {
  status: number;
  body: Record<string, unknown>;
}

const KEYS_FOR_MS = 60 * 60_000;
/** At most one fetch of Apple's keys a minute, however many unknown kids arrive. */
const REFETCH_AFTER_MS = 60_000;

/** Deps.keys, cached an hour; `fresh` refetches, but not within a minute of the last. */
export function appleKeyCache(
  fetchKeys: () => Promise<AppleJwk[] | null>,
  nowMs: () => number,
): Deps['keys'] {
  let cached: { at: number; keys: AppleJwk[] } | null = null;
  let fetchedAt = Number.NEGATIVE_INFINITY;
  return async (fresh) => {
    const now = nowMs();
    if (!fresh && cached && now - cached.at < KEYS_FOR_MS) return cached.keys;
    if (now - fetchedAt < REFETCH_AFTER_MS) return cached?.keys ?? [];
    fetchedAt = now;
    const keys = await fetchKeys();
    if (keys) cached = { at: now, keys };
    return cached?.keys ?? [];
  };
}

/** Older than this, a notice is a replay, not news. */
const MAX_AGE_S = 7 * 86_400;

function json(part: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(fromBase64url(part)));
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The claims of a JWT signed by one of Apple's keys; null otherwise. */
export async function verifiedClaims(
  token: string,
  deps: Pick<Deps, 'keys'>,
): Promise<Record<string, unknown> | null> {
  const [head, body, signature] = token.split('.');
  if (!head || !body || !signature) return null;
  const header = json(head);
  if (header?.alg !== 'RS256' || typeof header.kid !== 'string') return null;
  let jwk = (await deps.keys(false)).find((k) => k.kid === header.kid);
  jwk ??= (await deps.keys(true)).find((k) => k.kid === header.kid);
  if (!jwk?.n || !jwk.e) return null;
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      fromBase64url(signature),
      new TextEncoder().encode(`${head}.${body}`),
    );
    return ok ? json(body) : null;
  } catch {
    return null;
  }
}

export async function receiveNotification(payload: unknown, deps: Deps): Promise<Reply> {
  const token = (payload as { payload?: unknown } | null)?.payload;
  if (typeof token !== 'string') return { status: 400, body: { error: 'No payload.' } };

  const claims = await verifiedClaims(token, deps);
  if (!claims) return { status: 401, body: { error: 'Not signed by Apple.' } };
  const now = deps.nowSeconds();
  const iat = typeof claims.iat === 'number' ? claims.iat : 0;
  if (
    claims.iss !== APPLE_ISSUER ||
    !isAppleClient(claims.aud) ||
    iat < now - MAX_AGE_S ||
    iat > now + 300
  ) {
    return { status: 401, body: { error: 'Not for the club.' } };
  }

  // Apple sends `events` as a string of JSON.
  let events: unknown = claims.events;
  if (typeof events === 'string') {
    try {
      events = JSON.parse(events);
    } catch {
      events = null;
    }
  }
  const event = (events ?? {}) as { type?: unknown; sub?: unknown; email?: unknown };
  if (typeof event.type !== 'string' || typeof event.sub !== 'string') {
    return { status: 400, body: { error: 'No event.' } };
  }
  const email = typeof event.email === 'string' ? event.email : null;
  const recorded = await deps.record(event.sub, event.type, email);
  // Not 200, so Apple sends it again.
  if (recorded === null) return { status: 502, body: { error: 'Not recorded.' } };
  deps.log(`apple-notifications: ${event.type}${recorded ? ', recorded' : ''}`);
  return { status: 200, body: { recorded } };
}
