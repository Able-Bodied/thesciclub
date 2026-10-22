// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  APPLE_APP_CLIENT,
  appleClientSecret,
  appleError,
  appleKeyFrom,
  base64url,
  fromBase64url,
  jwtClaims,
  postToApple,
} from './apple.ts';

async function makeKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const body = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, '$1\n');
  return { pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`, pair };
}

describe('the client secret', () => {
  it('is an ES256 JWT for the client named, signed with the key, for five minutes', async () => {
    const { pem, pair } = await makeKey();
    const secret = await appleClientSecret(
      { teamId: 'TEAM123456', keyId: 'KEY1234567', p8: pem },
      APPLE_APP_CLIENT,
      1_800_000_000,
    );
    const [head, body, signature] = secret.split('.');
    expect(JSON.parse(new TextDecoder().decode(fromBase64url(head ?? '')))).toEqual({
      alg: 'ES256',
      kid: 'KEY1234567',
    });
    expect(jwtClaims(secret)).toEqual({
      iss: 'TEAM123456',
      iat: 1_800_000_000,
      exp: 1_800_000_300,
      aud: 'https://appleid.apple.com',
      sub: 'com.thesciclub.app',
    });
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      fromBase64url(signature ?? ''),
      new TextEncoder().encode(`${head}.${body}`),
    );
    expect(ok).toBe(true);
  });
});

describe('the key from secrets', () => {
  it('needs all three', () => {
    const all: Record<string, string> = {
      APPLE_TEAM_ID: 'T',
      APPLE_SIWA_KEY_ID: 'K',
      APPLE_SIWA_KEY_P8: 'P',
    };
    expect(appleKeyFrom((name) => all[name])).toEqual({ teamId: 'T', keyId: 'K', p8: 'P' });
    expect(appleKeyFrom((name) => (name === 'APPLE_SIWA_KEY_P8' ? undefined : all[name]))).toBe(
      null,
    );
  });
});

describe('talking to Apple', () => {
  it('posts a form and reads the answer, even an empty one', async () => {
    let sent: RequestInit | undefined;
    const answer = await postToApple('https://apple.invalid', { a: '1 2' }, (_url, init) => {
      sent = init;
      return Promise.resolve(new Response('', { status: 200 }));
    });
    expect(sent?.body).toBe('a=1+2');
    expect(answer).toEqual({ status: 200, body: {} });
  });

  it('turns an unreachable Apple into status 0, and an error into a line without the token', async () => {
    const answer = await postToApple('https://apple.invalid', {}, () =>
      Promise.reject(new Error('offline')),
    );
    expect(answer.status).toBe(0);
    expect(appleError({ status: 400, body: { error: 'invalid_grant' } })).toBe(
      'HTTP 400 invalid_grant',
    );
  });

  it('reads claims, and nothing from what is not a JWT', () => {
    const token = `x.${base64url(new TextEncoder().encode('{"sub":"001.a"}'))}.y`;
    expect(jwtClaims(token)).toEqual({ sub: '001.a' });
    expect(jwtClaims('nope')).toBe(null);
    expect(jwtClaims(42)).toBe(null);
  });
});
