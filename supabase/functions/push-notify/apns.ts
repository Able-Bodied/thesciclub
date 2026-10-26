/**
 * APNs: the store app's iPhones, sent to Apple directly with token auth.
 *
 * A device's endpoint is `apns:<production|sandbox>:<hex token>`
 * (20261023030000). TestFlight and App Store builds hand out production
 * tokens; only a development build from Xcode hands out sandbox ones, and each
 * is good at its own host only.
 *
 * The provider token is a JWT signed ES256 with the .p8 key. Apple refuses one
 * older than an hour, and refreshing more often than every 20 minutes earns
 * 429 TooManyProviderTokenUpdates. So `iat` is the start of the current
 * half hour: every send in that half hour, in any running copy of this
 * function, carries the same `iat`, at most 30 minutes old.
 *
 * Pure apart from `fetch` and WebCrypto, so Vitest runs it (apns.test.ts).
 * Deno's fetch speaks HTTP/2 to Apple, which APNs requires.
 */

import type { PushMessage } from './compose.ts';
import { toBase64Url } from './webpush.ts';

export const APNS_HOSTS = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
} as const;

export type ApnsEnvironment = keyof typeof APNS_HOSTS;

/** Apple's limit for an alert's JSON. */
export const APNS_MAX_BYTES = 4096;

/** How long one provider token is used, in seconds. */
export const TOKEN_WINDOW = 30 * 60;

export interface ApnsKeys {
  keyId: string;
  teamId: string;
  bundleId: string;
  /** The .p8 file, base64 (APNS_KEY_P8); its PEM text is accepted too. */
  keyP8: string;
}

export interface ApnsDevice {
  environment: ApnsEnvironment;
  token: string;
}

const encoder = new TextEncoder();
const DEVICE = /^apns:(production|sandbox):([0-9a-f]{64,200})$/;

/** The environment and token of an app endpoint, or null for any other. */
export function apnsDevice(endpoint: string): ApnsDevice | null {
  const match = DEVICE.exec(endpoint);
  if (!match?.[1] || !match[2]) return null;
  return { environment: match[1] as ApnsEnvironment, token: match[2] };
}

/** The four secrets, or null while any is missing. */
export function apnsKeys(read: (name: string) => string | undefined): ApnsKeys | null {
  const keyId = read('APNS_KEY_ID')?.trim() ?? '';
  const teamId = read('APNS_TEAM_ID')?.trim() ?? '';
  const bundleId = read('APNS_BUNDLE_ID')?.trim() ?? '';
  const keyP8 = read('APNS_KEY_P8')?.trim() ?? '';
  if (!keyId || !teamId || !bundleId || !keyP8) return null;
  return { keyId, teamId, bundleId, keyP8 };
}

function bytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64.replace(/\s+/g, ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** The .p8's PKCS #8 bytes, from its base64 or its PEM. */
export function p8Bytes(keyP8: string): Uint8Array<ArrayBuffer> {
  const pem = keyP8.includes('-----BEGIN') ? keyP8 : new TextDecoder().decode(bytes(keyP8));
  const body = /-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/.exec(pem)?.[1];
  if (!body) throw new Error('APNS_KEY_P8 is not a .p8 key');
  return bytes(body);
}

// The promise, not the token: a message to many iPhones asks at once, and
// all of them must share one signature.
let cached: { keyId: string; iat: number; token: Promise<string> } | null = null;

/** The provider token for this half hour, signed once per running copy. */
export function providerToken(keys: ApnsKeys, now: number = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000 / TOKEN_WINDOW) * TOKEN_WINDOW;
  if (cached?.keyId === keys.keyId && cached.iat === iat) return cached.token;
  const token = signToken(keys, iat);
  const entry = { keyId: keys.keyId, iat, token };
  cached = entry;
  token.catch(() => {
    if (cached === entry) cached = null;
  });
  return token;
}

async function signToken(keys: ApnsKeys, iat: number): Promise<string> {
  const header = toBase64Url(encoder.encode(JSON.stringify({ alg: 'ES256', kid: keys.keyId })));
  const claims = toBase64Url(encoder.encode(JSON.stringify({ iss: keys.teamId, iat })));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    p8Bytes(keys.keyP8),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  // WebCrypto's ECDSA signature is already r‖s, which is what JWS wants.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(`${header}.${claims}`),
  );
  return `${header}.${claims}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * The alert: the same title, words and badge as web push. The badge is the
 * member's unread count, on message pushes only; 0 clears the icon, and none
 * leaves it as it is. The app keeps it true while open (src/lib/chat/unread.ts).
 */
export function apnsPayload(message: PushMessage): string | null {
  const { badge } = message;
  const counted = typeof badge === 'number' && Number.isInteger(badge) && badge >= 0;
  const shape = (body: string) =>
    JSON.stringify({
      aps: {
        alert: { title: message.title, body },
        sound: 'default',
        ...(counted ? { badge } : {}),
      },
      url: message.url,
    });
  let payload = shape(message.body);
  if (encoder.encode(payload).length > APNS_MAX_BYTES) payload = shape('');
  return encoder.encode(payload).length > APNS_MAX_BYTES ? null : payload;
}

export interface ApnsResult {
  status: number;
  /** Apple's reason on a refusal, such as BadDeviceToken. */
  reason: string | null;
}

/** Whether Apple says the token will never work again, so the club forgets it. */
export function apnsGone({ status, reason }: ApnsResult): boolean {
  return status === 410 || (status === 400 && reason === 'BadDeviceToken');
}

/** Send one alert to one iPhone. */
export async function sendApns(
  device: ApnsDevice,
  message: PushMessage,
  keys: ApnsKeys,
  send: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<ApnsResult> {
  const payload = apnsPayload(message);
  if (payload === null) return { status: 413, reason: 'PayloadTooLarge' };
  const headers: Record<string, string> = {
    authorization: `bearer ${await providerToken(keys, now)}`,
    'apns-topic': keys.bundleId,
    'apns-push-type': 'alert',
    'apns-priority': '10',
    // A day, as web push's TTL.
    'apns-expiration': String(Math.floor(now / 1000) + 86_400),
    'content-type': 'application/json',
  };
  // The web's tag: a newer one replaces the last on the lock screen.
  if (message.tag && encoder.encode(message.tag).length <= 64) {
    headers['apns-collapse-id'] = message.tag;
  }
  const response = await send(`${APNS_HOSTS[device.environment]}/3/device/${device.token}`, {
    method: 'POST',
    headers,
    body: payload,
  });
  let reason: string | null = null;
  if (response.status !== 200) {
    const body = (await response.json().catch(() => null)) as { reason?: unknown } | null;
    reason = typeof body?.reason === 'string' ? body.reason : null;
  } else {
    await response.arrayBuffer().catch(() => undefined);
  }
  return { status: response.status, reason };
}
