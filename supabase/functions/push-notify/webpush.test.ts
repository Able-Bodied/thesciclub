// @vitest-environment node
// WebCrypto's subtle API is Node's; jsdom does not provide one.
import { describe, expect, it } from 'vitest';
import { encrypt, fromBase64Url, toBase64Url, vapidAuthorization } from './webpush.ts';

/**
 * The worked example in RFC 8291 §5, every value copied from the RFC.
 *
 * This is the test that matters. A push service that cannot decrypt a
 * message drops it without saying so, so the only evidence the encryption is
 * right is reproducing somebody else's bytes exactly.
 */
const rfc = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPublic:
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

describe('encrypt', () => {
  it('reproduces RFC 8291’s example byte for byte', async () => {
    const body = await encrypt(
      new TextEncoder().encode(rfc.plaintext),
      rfc.uaPublic,
      rfc.authSecret,
      {
        salt: fromBase64Url(rfc.salt),
        server: { d: rfc.asPrivate, publicKey: rfc.asPublic },
      },
    );
    expect(toBase64Url(body)).toBe(rfc.body);
  });

  it('uses a fresh key and salt for every message when nothing is fixed', async () => {
    const plaintext = new TextEncoder().encode('same words');
    const one = await encrypt(plaintext, rfc.uaPublic, rfc.authSecret);
    const two = await encrypt(plaintext, rfc.uaPublic, rfc.authSecret);
    expect(toBase64Url(one)).not.toBe(toBase64Url(two));
    // salt 16 + record size 4 + key id length 1 + key 65 + words + delimiter + tag 16
    expect(one.length).toBe(16 + 4 + 1 + 65 + plaintext.length + 1 + 16);
  });
});

describe('vapidAuthorization', () => {
  it('signs a JWT for the endpoint’s origin that verifies under the public key', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);
    const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const keys = { publicKey: toBase64Url(publicRaw), privateKey: jwk.d ?? '' };
    const now = Date.UTC(2026, 8, 27, 12);

    const header = await vapidAuthorization(
      'https://web.push.apple.com/QGuQyavXutnMH8',
      keys,
      'https://thesciclub.netlify.app',
      now,
    );

    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, head, claims, signature, k] = match as unknown as string[];
    expect(k).toBe(keys.publicKey);
    expect(JSON.parse(new TextDecoder().decode(fromBase64Url(claims ?? '')))).toEqual({
      aud: 'https://web.push.apple.com',
      exp: now / 1000 + 12 * 60 * 60,
      sub: 'https://thesciclub.netlify.app',
    });
    const verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      fromBase64Url(signature ?? ''),
      new TextEncoder().encode(`${head}.${claims}`),
    );
    expect(verified).toBe(true);
  });
});
