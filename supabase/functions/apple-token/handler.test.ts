// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { AppleAnswer, AppleClient } from '../_shared/apple.ts';
import { base64url } from '../_shared/apple.ts';
import { type Caller, type Deps, keepAppleToken } from './handler.ts';

const MEMBER = '11111111-1111-4111-8111-111111111111';

function idToken(claims: Record<string, unknown>): string {
  return `h.${base64url(new TextEncoder().encode(JSON.stringify(claims)))}.s`;
}

function setup({
  caller = { id: MEMBER, appleSubs: ['001.mine'] },
  answer = {
    status: 200,
    body: {
      refresh_token: 'rt-new',
      id_token: idToken({ sub: '001.mine', aud: 'com.thesciclub.app' }),
    },
  },
  kept = true,
}: {
  caller?: Caller | null;
  answer?: AppleAnswer;
  kept?: boolean;
} = {}) {
  const log = {
    asked: [] as { client: AppleClient; form: Record<string, string> }[],
    kept: [] as string[],
    lines: [] as string[],
  };
  const deps: Deps = {
    caller: (jwt) => Promise.resolve(jwt === 'good' ? caller : null),
    askApple: (client, form) => {
      log.asked.push({ client, form });
      return Promise.resolve(answer);
    },
    keep: (userId, sub, client, token) => {
      log.kept.push(`${userId}|${sub}|${client}|${token}`);
      return Promise.resolve(kept);
    },
    log: (line) => log.lines.push(line),
  };
  return { deps, log };
}

describe('apple-token', () => {
  it('exchanges a native code as the app, and keeps the refresh token Apple gives', async () => {
    const { deps, log } = setup();
    const reply = await keepAppleToken('Bearer good', { code: 'c-1' }, deps);
    expect(reply).toEqual({ status: 200, body: { kept: true } });
    expect(log.asked).toEqual([
      { client: 'com.thesciclub.app', form: { grant_type: 'authorization_code', code: 'c-1' } },
    ]);
    expect(log.kept).toEqual([`${MEMBER}|001.mine|com.thesciclub.app|rt-new`]);
  });

  it('checks a web refresh token with Apple as the Services ID, and keeps that one', async () => {
    const { deps, log } = setup({
      answer: {
        status: 200,
        body: { id_token: idToken({ sub: '001.mine', aud: 'com.thesciclub.web' }) },
      },
    });
    const reply = await keepAppleToken('Bearer good', { refresh_token: 'rt-web' }, deps);
    expect(reply.status).toBe(200);
    expect(log.asked[0]).toEqual({
      client: 'com.thesciclub.web',
      form: { grant_type: 'refresh_token', refresh_token: 'rt-web' },
    });
    expect(log.kept).toEqual([`${MEMBER}|001.mine|com.thesciclub.web|rt-web`]);
    expect(log.lines).toEqual([]);
  });

  it('keeps a web refresh token Apple accepts without an ID token, for the one Apple identity', async () => {
    const { deps, log } = setup({ answer: { status: 200, body: { access_token: 'a' } } });
    expect((await keepAppleToken('Bearer good', { refresh_token: 'rt-web' }, deps)).status).toBe(
      200,
    );
    expect(log.kept).toEqual([`${MEMBER}|001.mine|com.thesciclub.web|rt-web`]);
    expect(log.lines).toEqual([
      'apple-token: WARNING the no-ID-token fallback took a com.thesciclub.web token; Apple answered with access_token',
    ]);
    const two = setup({
      caller: { id: MEMBER, appleSubs: ['001.mine', '001.other'] },
      answer: { status: 200, body: { access_token: 'a' } },
    });
    expect(
      (await keepAppleToken('Bearer good', { refresh_token: 'rt-web' }, two.deps)).status,
    ).toBe(502);
    expect(two.log.kept).toEqual([]);
  });

  it('never keeps a native code’s token without Apple’s ID token', async () => {
    const { deps, log } = setup({ answer: { status: 200, body: { refresh_token: 'rt-x' } } });
    expect((await keepAppleToken('Bearer good', { code: 'c-1' }, deps)).status).toBe(502);
    expect(log.kept).toEqual([]);
  });

  it('keeps nothing for an Apple ID that is not one of the account’s', async () => {
    const { deps, log } = setup({
      answer: {
        status: 200,
        body: {
          refresh_token: 'rt-other',
          id_token: idToken({ sub: '001.someone', aud: 'com.thesciclub.app' }),
        },
      },
    });
    const reply = await keepAppleToken('Bearer good', { code: 'c-1' }, deps);
    expect(reply.status).toBe(403);
    expect(log.kept).toEqual([]);
  });

  it('keeps nothing when Apple’s token is for another client', async () => {
    const { deps, log } = setup({
      answer: {
        status: 200,
        body: {
          refresh_token: 'rt-x',
          id_token: idToken({ sub: '001.mine', aud: 'com.example.other' }),
        },
      },
    });
    expect((await keepAppleToken('Bearer good', { code: 'c-1' }, deps)).status).toBe(502);
    expect(log.kept).toEqual([]);
  });

  it('says Apple refused, and logs the code but never the token', async () => {
    const { deps, log } = setup({ answer: { status: 400, body: { error: 'invalid_grant' } } });
    const reply = await keepAppleToken('Bearer good', { refresh_token: 'rt-secret' }, deps);
    expect(reply.status).toBe(502);
    expect(log.lines.join('\n')).toContain('invalid_grant');
    expect(log.lines.join('\n')).not.toContain('rt-secret');
  });

  it('refuses a caller with no session, or no Apple identity, before asking Apple', async () => {
    const signedOut = setup();
    expect((await keepAppleToken(null, { code: 'c' }, signedOut.deps)).status).toBe(401);
    expect((await keepAppleToken('Bearer bad', { code: 'c' }, signedOut.deps)).status).toBe(401);
    const noApple = setup({ caller: { id: MEMBER, appleSubs: [] } });
    expect((await keepAppleToken('Bearer good', { code: 'c' }, noApple.deps)).status).toBe(409);
    expect([...signedOut.log.asked, ...noApple.log.asked]).toEqual([]);
  });

  it('wants exactly one of code and refresh_token', async () => {
    const { deps, log } = setup();
    expect((await keepAppleToken('Bearer good', {}, deps)).status).toBe(400);
    expect(
      (await keepAppleToken('Bearer good', { code: 'c', refresh_token: 'r' }, deps)).status,
    ).toBe(400);
    expect((await keepAppleToken('Bearer good', { code: 7 }, deps)).status).toBe(400);
    expect(log.asked).toEqual([]);
  });

  it('answers 409 when the identity went before it could be kept', async () => {
    const { deps } = setup({ kept: false });
    expect((await keepAppleToken('Bearer good', { code: 'c-1' }, deps)).status).toBe(409);
  });
});
