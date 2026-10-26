// @vitest-environment node
// WebCrypto's subtle API is Node's; jsdom does not provide one.
import { describe, expect, it } from 'vitest';
import {
  APNS_MAX_BYTES,
  type ApnsKeys,
  apnsDevice,
  apnsGone,
  apnsKeys,
  apnsPayload,
  p8Bytes,
  providerToken,
  sendApns,
  TOKEN_WINDOW,
} from './apns.ts';
import { fromBase64Url } from './webpush.ts';

const TOKEN = 'ab'.repeat(32);

/** A throwaway P-256 key, as Apple's .p8 is: PKCS #8 in PEM. */
async function testKey(): Promise<{ keys: ApnsKeys; publicKey: CryptoKey; pem: string }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const body = btoa(String.fromCharCode(...der));
  const pem = `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----\n`;
  return {
    keys: {
      keyId: 'KEY1234567',
      teamId: 'TEAM123456',
      bundleId: 'com.example.app',
      keyP8: btoa(pem),
    },
    publicKey: pair.publicKey,
    pem,
  };
}

function decode(part: string): unknown {
  return JSON.parse(new TextDecoder().decode(fromBase64Url(part)));
}

describe('apnsDevice', () => {
  it('reads an app endpoint and nothing else', () => {
    expect(apnsDevice(`apns:production:${TOKEN}`)).toEqual({
      environment: 'production',
      token: TOKEN,
    });
    expect(apnsDevice(`apns:sandbox:${TOKEN}`)?.environment).toBe('sandbox');
    expect(apnsDevice(`apns:development:${TOKEN}`)).toBeNull();
    expect(apnsDevice(`apns:production:${TOKEN}/x`)).toBeNull();
    expect(apnsDevice('https://web.push.apple.com/abc')).toBeNull();
  });
});

describe('apnsKeys', () => {
  it('needs all four secrets', () => {
    const all: Record<string, string> = {
      APNS_KEY_ID: 'K',
      APNS_TEAM_ID: 'T',
      APNS_BUNDLE_ID: 'B',
      APNS_KEY_P8: 'P',
    };
    expect(apnsKeys((name) => all[name])).toEqual({
      keyId: 'K',
      teamId: 'T',
      bundleId: 'B',
      keyP8: 'P',
    });
    expect(apnsKeys((name) => (name === 'APNS_KEY_P8' ? ' ' : all[name]))).toBeNull();
  });
});

describe('providerToken', () => {
  it('is an ES256 JWT Apple can verify with the key', async () => {
    const { keys, publicKey } = await testKey();
    const now = Date.UTC(2026, 9, 23, 12, 40);
    const jwt = await providerToken(keys, now);
    const [header = '', claims = '', signature = ''] = jwt.split('.');
    expect(decode(header)).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
    // The start of the half hour: 12:30.
    expect(decode(claims)).toEqual({
      iss: 'TEAM123456',
      iat: Date.UTC(2026, 9, 23, 12, 30) / 1000,
    });
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      fromBase64Url(signature),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);
  });

  it('is reused for the half hour, then signed anew', async () => {
    const { keys } = await testKey();
    const start = Date.UTC(2026, 9, 23, 13, 0);
    const first = await providerToken(keys, start);
    expect(await providerToken(keys, start + (TOKEN_WINDOW - 1) * 1000)).toBe(first);
    const next = await providerToken(keys, start + TOKEN_WINDOW * 1000);
    expect(next).not.toBe(first);
  });

  it('is signed once when many sends ask at the same moment', async () => {
    const { keys } = await testKey();
    const now = Date.UTC(2026, 9, 23, 14, 0);
    const tokens = await Promise.all(Array.from({ length: 5 }, () => providerToken(keys, now)));
    expect(new Set(tokens).size).toBe(1);
  });

  it('signs again after a key that would not sign', async () => {
    const { keys } = await testKey();
    const now = Date.UTC(2026, 9, 23, 15, 0);
    await expect(providerToken({ ...keys, keyP8: btoa('no key') }, now)).rejects.toThrow();
    expect(await providerToken(keys, now)).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it('takes the .p8 as base64 or as its PEM', async () => {
    const { keys, pem } = await testKey();
    expect(p8Bytes(pem)).toEqual(p8Bytes(keys.keyP8));
    expect(() => p8Bytes(btoa('not a key'))).toThrow('APNS_KEY_P8');
  });
});

describe('apnsPayload', () => {
  const message = {
    title: 'Direct message from Bo',
    body: 'See you there',
    url: '/chat/t/1',
    tag: 'thread:1',
  };

  it('carries the title, the words, the badge and where a tap goes', () => {
    expect(JSON.parse(apnsPayload({ ...message, badge: 3 }) ?? '')).toEqual({
      aps: {
        alert: { title: 'Direct message from Bo', body: 'See you there' },
        sound: 'default',
        badge: 3,
      },
      url: '/chat/t/1',
    });
  });

  it('sends 0 to clear the icon, and leaves it alone with no count', () => {
    const badge = (m: typeof message & { badge?: number }) =>
      (JSON.parse(apnsPayload(m) ?? '') as { aps: { badge?: number } }).aps.badge;
    expect(badge({ ...message, badge: 0 })).toBe(0);
    expect(badge(message)).toBeUndefined();
    expect(badge({ ...message, badge: -1 })).toBeUndefined();
    expect(badge({ ...message, badge: 1.5 })).toBeUndefined();
  });

  it('drops the words rather than go over Apple’s limit', () => {
    const payload = apnsPayload({ ...message, body: 'x'.repeat(APNS_MAX_BYTES) }) ?? '';
    expect(new TextEncoder().encode(payload).length).toBeLessThanOrEqual(APNS_MAX_BYTES);
    const parsed = JSON.parse(payload) as { aps: { alert: { body: string } } };
    expect(parsed.aps.alert.body).toBe('');
  });

  it('keeps the badge when it drops the words', () => {
    const long = { ...message, body: 'x'.repeat(APNS_MAX_BYTES), badge: 12 };
    const parsed = JSON.parse(apnsPayload(long) ?? '') as { aps: { badge: number } };
    expect(parsed.aps.badge).toBe(12);
  });
});

describe('apnsGone', () => {
  it('forgets a token only when Apple says it is dead', () => {
    expect(apnsGone({ status: 410, reason: 'Unregistered' })).toBe(true);
    expect(apnsGone({ status: 400, reason: 'BadDeviceToken' })).toBe(true);
    // A wrong bundle ID or key is ours to fix, not the member's phone.
    expect(apnsGone({ status: 400, reason: 'DeviceTokenNotForTopic' })).toBe(false);
    expect(apnsGone({ status: 403, reason: 'InvalidProviderToken' })).toBe(false);
    expect(apnsGone({ status: 429, reason: 'TooManyProviderTokenUpdates' })).toBe(false);
  });
});

describe('sendApns', () => {
  it('sends to the device’s own host with Apple’s headers', async () => {
    const { keys } = await testKey();
    const calls: { url: string; init: RequestInit }[] = [];
    const send = ((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(
        new Response(JSON.stringify({ reason: 'BadDeviceToken' }), { status: 400 }),
      );
    }) as typeof fetch;
    const message = { title: 'T', body: 'B', url: '/', tag: 'thread:1' };
    const now = Date.UTC(2026, 9, 23, 12, 0);

    const result = await sendApns(
      { environment: 'sandbox', token: TOKEN },
      message,
      keys,
      send,
      now,
    );
    expect(result).toEqual({ status: 400, reason: 'BadDeviceToken' });
    await sendApns({ environment: 'production', token: TOKEN }, message, keys, send, now);

    expect(calls.map((c) => c.url)).toEqual([
      `https://api.sandbox.push.apple.com/3/device/${TOKEN}`,
      `https://api.push.apple.com/3/device/${TOKEN}`,
    ]);
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(headers['apns-topic']).toBe('com.example.app');
    expect(headers['apns-push-type']).toBe('alert');
    expect(headers['apns-collapse-id']).toBe('thread:1');
    expect(headers['apns-expiration']).toBe(String(now / 1000 + 86_400));
  });
});
