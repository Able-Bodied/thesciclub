/**
 * Sign in with Apple's REST API, shared by apple-token, apple-revoke and
 * apple-notifications.
 *
 * Apple takes no fixed secret: each call carries a short JWT signed with the
 * club's Sign in with Apple key (.p8), naming the client it is for, as
 * scripts/apple-secret.mjs does for the website's six-month one.
 */

/** The store app's bundle ID: native sign-ins. */
export const APPLE_APP_CLIENT = 'com.thesciclub.app';
/** The Services ID: sign-ins on thesciclub.com. */
export const APPLE_WEB_CLIENT = 'com.thesciclub.web';

export type AppleClient = typeof APPLE_APP_CLIENT | typeof APPLE_WEB_CLIENT;

export function isAppleClient(value: unknown): value is AppleClient {
  return value === APPLE_APP_CLIENT || value === APPLE_WEB_CLIENT;
}

export const APPLE_ISSUER = 'https://appleid.apple.com';
export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
export const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';

export interface AppleKey {
  teamId: string;
  keyId: string;
  /** The .p8 file's text, BEGIN and END lines included. */
  p8: string;
}

/** The key from the function's secrets; null when one is missing. */
export function appleKeyFrom(get: (name: string) => string | undefined): AppleKey | null {
  const teamId = get('APPLE_TEAM_ID')?.trim();
  const keyId = get('APPLE_SIWA_KEY_ID')?.trim();
  const p8 = get('APPLE_SIWA_KEY_P8')?.trim();
  return teamId && keyId && p8 ? { teamId, keyId, p8 } : null;
}

export function base64url(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const plain = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(plain, (c) => c.charCodeAt(0));
}

function pkcs8(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

/** Five minutes is plenty: one is made for each call. */
const SECRET_LIFETIME_S = 300;

/** The client_secret for one call to Apple, as `client`. */
export async function appleClientSecret(
  key: AppleKey,
  client: AppleClient,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const encode = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned = `${encode({ alg: 'ES256', kid: key.keyId })}.${encode({
    iss: key.teamId,
    iat: nowSeconds,
    exp: nowSeconds + SECRET_LIFETIME_S,
    aud: APPLE_ISSUER,
    sub: client,
  })}`;
  const signingKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8(key.p8),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  // WebCrypto's ECDSA signature is already the raw r‖s a JWT wants.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
}

/**
 * A JWT's claims, unverified. Only for a token Apple handed back directly
 * over TLS, never for one a caller sent.
 */
export function jwtClaims(token: unknown): Record<string, unknown> | null {
  if (typeof token !== 'string') return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const claims: unknown = JSON.parse(new TextDecoder().decode(fromBase64url(part)));
    return claims && typeof claims === 'object' ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export interface AppleAnswer {
  status: number;
  body: Record<string, unknown>;
}

/** A form POST to Apple. Never throws: a network failure is status 0. */
export async function postToApple(
  url: string,
  form: Record<string, string>,
  send: typeof fetch = fetch,
): Promise<AppleAnswer> {
  try {
    const response = await send(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    });
    const text = await response.text();
    let body: Record<string, unknown> = {};
    try {
      const parsed: unknown = text ? JSON.parse(text) : {};
      if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
    } catch {
      // Apple's revoke answers 200 with an empty body.
    }
    return { status: response.status, body };
  } catch {
    return { status: 0, body: { error: 'unreachable' } };
  }
}

/** Apple's error code, for logs: never the token. */
export function appleError(answer: AppleAnswer): string {
  const code = answer.body.error;
  return `HTTP ${answer.status}${typeof code === 'string' ? ` ${code}` : ''}`;
}
