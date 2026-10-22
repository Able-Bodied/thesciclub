// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { base64url } from '../_shared/apple.ts';
import { type AppleJwk, appleKeyCache, type Deps, receiveNotification } from './handler.ts';

const NOW = 1_800_000_000;
let pair: CryptoKeyPair;
let publicJwk: AppleJwk;

beforeAll(async () => {
  pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  publicJwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'apple-1' };
});

const encode = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));

async function signed(claims: Record<string, unknown>, kid = 'apple-1'): Promise<string> {
  const unsigned = `${encode({ alg: 'RS256', kid })}.${encode(claims)}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    pair.privateKey,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
}

function notice(event: Record<string, unknown>, over: Record<string, unknown> = {}) {
  return {
    iss: 'https://appleid.apple.com',
    aud: 'com.thesciclub.app',
    iat: NOW - 60,
    jti: 'j1',
    events: JSON.stringify(event),
    ...over,
  };
}

function setup({
  keys = () => [publicJwk],
  recorded = true,
}: {
  keys?: () => AppleJwk[];
  recorded?: boolean | null;
} = {}) {
  const log = { recorded: [] as string[], fresh: 0 };
  const deps: Deps = {
    keys: (fresh) => {
      if (fresh) log.fresh += 1;
      return Promise.resolve(keys());
    },
    record: (sub, kind, email) => {
      log.recorded.push(`${sub}|${kind}|${email ?? ''}`);
      return Promise.resolve(recorded);
    },
    nowSeconds: () => NOW,
    log: () => undefined,
  };
  return { deps, log };
}

describe('apple-notifications', () => {
  it('records an event signed by Apple, for the club', async () => {
    const { deps, log } = setup();
    const token = await signed(notice({ type: 'consent-revoked', sub: '001.a' }));
    expect(await receiveNotification({ payload: token }, deps)).toEqual({
      status: 200,
      body: { recorded: true },
    });
    expect(log.recorded).toEqual(['001.a|consent-revoked|']);
  });

  it('passes the relay address on an email event', async () => {
    const { deps, log } = setup();
    const token = await signed(
      notice(
        {
          type: 'email-disabled',
          sub: '001.a',
          email: 'x@privaterelay.appleid.com',
          is_private_email: 'true',
        },
        { aud: 'com.thesciclub.web' },
      ),
    );
    expect((await receiveNotification({ payload: token }, deps)).status).toBe(200);
    expect(log.recorded).toEqual(['001.a|email-disabled|x@privaterelay.appleid.com']);
  });

  it('refuses a payload whose signature does not check', async () => {
    const { deps, log } = setup();
    const token = await signed(notice({ type: 'account-delete', sub: '001.a' }));
    const [head, , signature] = token.split('.');
    const forged = `${head}.${encode(notice({ type: 'account-delete', sub: '001.victim' }))}.${signature}`;
    expect((await receiveNotification({ payload: forged }, deps)).status).toBe(401);
    expect(log.recorded).toEqual([]);
  });

  it('refuses another app’s notice, another issuer’s, and a stale one', async () => {
    const { deps, log } = setup();
    const event = { type: 'account-delete', sub: '001.a' };
    for (const over of [
      { aud: 'com.example.app' },
      { iss: 'https://example.com' },
      { iat: NOW - 8 * 86_400 },
    ]) {
      const token = await signed(notice(event, over));
      expect((await receiveNotification({ payload: token }, deps)).status).toBe(401);
    }
    expect(log.recorded).toEqual([]);
  });

  it('asks Apple again for a key it has not seen, once', async () => {
    let calls = 0;
    const { deps, log } = setup({
      keys: () => {
        calls += 1;
        return calls === 1 ? [] : [publicJwk];
      },
    });
    const token = await signed(notice({ type: 'email-enabled', sub: '001.a' }));
    expect((await receiveNotification({ payload: token }, deps)).status).toBe(200);
    expect(log.fresh).toBe(1);
  });

  it('refuses an unknown key, and no payload', async () => {
    const { deps } = setup();
    const token = await signed(notice({ type: 'account-delete', sub: '001.a' }), 'other-key');
    expect((await receiveNotification({ payload: token }, deps)).status).toBe(401);
    expect((await receiveNotification({}, deps)).status).toBe(400);
    expect((await receiveNotification(null, deps)).status).toBe(400);
  });

  it('answers 502 when it could not be recorded, so Apple sends it again', async () => {
    const { deps } = setup({ recorded: null });
    const token = await signed(notice({ type: 'account-delete', sub: '001.a' }));
    expect((await receiveNotification({ payload: token }, deps)).status).toBe(502);
  });
});

describe('Apple’s keys, cached', () => {
  function cache(answers: (AppleJwk[] | null)[]) {
    let clock = 0;
    let fetches = 0;
    const keys = appleKeyCache(
      () => Promise.resolve(answers[fetches++] ?? null),
      () => clock,
    );
    return {
      keys,
      fetches: () => fetches,
      wait: (ms: number) => {
        clock += ms;
      },
    };
  }
  const k1 = { kid: 'k1' };
  const k2 = { kid: 'k2' };

  it('asks Apple once, then keeps the keys for an hour', async () => {
    const c = cache([[k1], [k2]]);
    expect(await c.keys(false)).toEqual([k1]);
    c.wait(59 * 60_000);
    expect(await c.keys(false)).toEqual([k1]);
    expect(c.fetches()).toBe(1);
    c.wait(2 * 60_000);
    expect(await c.keys(false)).toEqual([k2]);
    expect(c.fetches()).toBe(2);
  });

  it('asks again for an unknown kid at most once a minute, however many arrive', async () => {
    const c = cache([[k1], [k1], [k1, k2]]);
    await c.keys(false);
    for (let i = 0; i < 50; i++) await c.keys(true);
    expect(c.fetches()).toBe(1);
    c.wait(61_000);
    for (let i = 0; i < 50; i++) await c.keys(true);
    expect(c.fetches()).toBe(2);
    c.wait(61_000);
    expect(await c.keys(true)).toEqual([k1, k2]);
    expect(c.fetches()).toBe(3);
  });

  it('keeps the last keys when Apple cannot be reached, and waits a minute to retry', async () => {
    const c = cache([[k1], null, [k2]]);
    await c.keys(false);
    c.wait(61 * 60_000);
    expect(await c.keys(false)).toEqual([k1]);
    expect(await c.keys(false)).toEqual([k1]);
    expect(c.fetches()).toBe(2);
    c.wait(61_000);
    expect(await c.keys(false)).toEqual([k2]);
  });
});
