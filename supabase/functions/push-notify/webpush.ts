/**
 * Web Push on WebCrypto alone: VAPID (RFC 8292) and aes128gcm (RFC 8291).
 *
 * No library, because both halves are small and the same code then runs in
 * Deno (the Edge Function) and in Node (Vitest), where webpush.test.ts checks
 * the encryption byte for byte against the worked example in RFC 8291 §5.
 * A push service that cannot decrypt a message drops it silently, so a test
 * that "it produced bytes" would prove nothing.
 *
 * The keys are base64url throughout, the way the browser hands them over:
 * a subscription's `p256dh` (65 bytes) and `auth` (16), and the VAPID pair as
 * the raw public point (65) and the private scalar `d` (32).
 */

const encoder = new TextEncoder();

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** A P-256 key as JWK, from the raw public point and (optionally) the scalar. */
function p256Jwk(publicRaw: Uint8Array, d?: string): JsonWebKey {
  return {
    kty: 'EC',
    crv: 'P-256',
    x: toBase64Url(publicRaw.slice(1, 33)),
    y: toBase64Url(publicRaw.slice(33, 65)),
    ...(d ? { d } : {}),
    ext: true,
  };
}

async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

export interface VapidKeys {
  /** The raw public point, base64url — what the browser was given. */
  publicKey: string;
  /** The private scalar `d`, base64url. A function secret; never in the bundle. */
  privateKey: string;
}

/**
 * The `Authorization` header for one push service (RFC 8292): a JWT signed
 * with the VAPID key, scoped to the endpoint's origin, good for twelve hours.
 * `sub` is how the push service reaches us about abuse; a site URL is allowed.
 */
export async function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  subject: string,
  now: number = Date.now(),
): Promise<string> {
  const header = toBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = toBase64Url(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now / 1000) + 12 * 60 * 60,
        sub: subject,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    'jwk',
    p256Jwk(fromBase64Url(keys.publicKey), keys.privateKey),
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
  return `vapid t=${header}.${claims}.${toBase64Url(new Uint8Array(signature))}, k=${keys.publicKey}`;
}

/** Fixed only by the test, to reproduce RFC 8291's example. */
export interface EncryptionSeed {
  salt: Uint8Array<ArrayBuffer>;
  /** The application server's one-off ECDH pair, as `{ d, publicKey }` in base64url. */
  server: { d: string; publicKey: string };
}

/**
 * RFC 8291: encrypt `plaintext` for one subscription, as a single aes128gcm
 * record with its header. A fresh key pair and salt per message unless the
 * test fixes them.
 */
export async function encrypt(
  plaintext: Uint8Array,
  p256dh: string,
  auth: string,
  seed?: EncryptionSeed,
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = fromBase64Url(p256dh);
  const authSecret = fromBase64Url(auth);

  let serverPrivate: CryptoKey;
  let asPublic: Uint8Array<ArrayBuffer>;
  if (seed) {
    asPublic = fromBase64Url(seed.server.publicKey);
    serverPrivate = await crypto.subtle.importKey(
      'jwk',
      p256Jwk(asPublic, seed.server.d),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    );
  } else {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ]);
    serverPrivate = pair.privateKey;
    asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  }

  const uaKey = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, serverPrivate, 256),
  );

  // RFC 8291 §3.3–3.4. WebCrypto's HKDF is extract-then-expand in one call.
  const ikm = await hkdf(
    authSecret,
    ecdhSecret,
    concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic),
    32,
  );
  const salt = seed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // One record, so the padding delimiter is 2 ("last record") and no padding.
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      aesKey,
      concat(plaintext, new Uint8Array([2])),
    ),
  );

  // RFC 8188 header: salt, record size (4096), key id length, key id.
  const recordSize = new Uint8Array([0, 0, 0x10, 0]);
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

export interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Send one message; returns the push service's status. 201 is delivered;
 * 404 and 410 mean the subscription is gone and should be forgotten.
 */
export async function sendPush(
  subscription: Subscription,
  payload: string,
  keys: VapidKeys,
  subject: string,
  send: typeof fetch = fetch,
): Promise<number> {
  const body = await encrypt(encoder.encode(payload), subscription.p256dh, subscription.auth);
  const response = await send(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(subscription.endpoint, keys, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      // A day. A message nobody saw for a day is better read in the app.
      TTL: '86400',
      Urgency: 'high',
    },
    body,
  });
  // Read and drop the body so the connection is released.
  await response.arrayBuffer().catch(() => undefined);
  return response.status;
}
