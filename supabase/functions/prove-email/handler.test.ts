import { describe, expect, it, vi } from 'vitest';
import { type Deps, proveEmail, sha256Hex } from './handler.ts';

function deps(overrides: Partial<Deps> = {}) {
  const sent: string[] = [];
  const all: Deps = {
    callerId: () => Promise.resolve('account'),
    start: () => Promise.resolve('sam@example.com'),
    finish: () => Promise.resolve(true),
    sendEmail: (to, email) => {
      sent.push(`${to}: ${email.text}`);
      return Promise.resolve(true);
    },
    newCode: () => '012345',
    ...overrides,
  };
  return { all, sent };
}

describe('confirming your email from Me', () => {
  it('needs a session', async () => {
    const { all, sent } = deps({ callerId: () => Promise.resolve(null) });
    expect((await proveEmail(null, { send: true }, all)).status).toBe(401);
    expect(sent).toEqual([]);
  });

  it('emails a code to their own address, and keeps only a hash salted with the account', async () => {
    const start = vi.fn(() => Promise.resolve('sam@example.com'));
    const { all, sent } = deps({ start });
    expect(await proveEmail('Bearer jwt', { send: true, email: 'x@y.co' }, all)).toEqual({
      status: 200,
      body: { sent: true },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/^sam@example\.com: /);
    expect(sent[0]).toContain('012345');
    expect(start).toHaveBeenCalledWith('account', await sha256Hex('account:012345'));
  });

  it('has no link in it', async () => {
    const { all, sent } = deps();
    await proveEmail('Bearer jwt', { send: true }, all);
    expect(sent[0]).not.toMatch(/https?:/);
  });

  it('sends nothing when the database says not to', async () => {
    const { all, sent } = deps({ start: () => Promise.resolve(null) });
    expect((await proveEmail('Bearer jwt', { send: true }, all)).body).toEqual({ sent: false });
    expect(sent).toEqual([]);
  });

  it('confirms with the code, checked by its hash', async () => {
    const finish = vi.fn(() => Promise.resolve(true));
    const { all } = deps({ finish });
    expect((await proveEmail('Bearer jwt', { code: ' 012345 ' }, all)).body).toEqual({
      proved: true,
    });
    expect(finish).toHaveBeenCalledWith('account', await sha256Hex('account:012345'));
  });

  it('refuses anything else', async () => {
    const { all } = deps();
    expect((await proveEmail('Bearer jwt', { code: '12' }, all)).status).toBe(400);
    expect((await proveEmail('Bearer jwt', null, all)).status).toBe(400);
  });
});
