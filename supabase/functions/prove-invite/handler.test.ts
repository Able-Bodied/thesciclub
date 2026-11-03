import { describe, expect, it, vi } from 'vitest';
import { type Deps, proveInvite, SLOWEST_SEND_MS, sha256Hex } from './handler.ts';

function deps(overrides: Partial<Deps> = {}) {
  const sent: string[] = [];
  const waits: number[] = [];
  const all: Deps = {
    callerId: () => Promise.resolve('account'),
    start: () => Promise.resolve(true),
    finish: () => Promise.resolve(true),
    sendEmail: (to, email) => {
      sent.push(`${to}: ${email.text}`);
      return Promise.resolve(true);
    },
    newCode: () => '012345',
    now: () => 0,
    wait: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
    ...overrides,
  };
  return { all, sent, waits };
}

describe('asking for a code', () => {
  it('needs a session', async () => {
    const { all, sent } = deps({ callerId: () => Promise.resolve(null) });
    const reply = await proveInvite(null, { email: 'a@b.co' }, all);
    expect(reply.status).toBe(401);
    expect(sent).toEqual([]);
  });

  it('emails the code, and keeps only a hash salted with the account', async () => {
    const start = vi.fn(() => Promise.resolve(true));
    const { all, sent } = deps({ start });
    const reply = await proveInvite('Bearer jwt', { email: ' a@b.co ' }, all);
    expect(reply).toEqual({ status: 200, body: { sent: true } });
    expect(sent[0]).toContain('a@b.co: ');
    expect(sent[0]).toContain('012345');
    expect(start).toHaveBeenCalledWith('account', 'a@b.co', await sha256Hex('account:012345'));
  });

  it('answers alike, in the same time, when the address is not on the list', async () => {
    const listed = deps();
    const unlisted = deps({ start: () => Promise.resolve(false) });
    const a = await proveInvite('Bearer jwt', { email: 'a@b.co' }, listed.all);
    const b = await proveInvite('Bearer jwt', { email: 'a@b.co' }, unlisted.all);
    expect(b).toEqual(a);
    expect(unlisted.sent).toEqual([]);
    expect(unlisted.waits).toEqual([SLOWEST_SEND_MS]);
    expect(listed.waits).toEqual([SLOWEST_SEND_MS]);
  });

  it('takes off the wait what the work took', async () => {
    let at = 0;
    const { all, waits } = deps({
      now: () => at,
      sendEmail: () => {
        at = 1_500;
        return Promise.resolve(true);
      },
    });
    await proveInvite('Bearer jwt', { email: 'a@b.co' }, all);
    expect(waits).toEqual([SLOWEST_SEND_MS - 1_500]);
  });

  it('answers alike when the email did not go', async () => {
    const { all } = deps({ sendEmail: () => Promise.resolve(false) });
    const reply = await proveInvite('Bearer jwt', { email: 'a@b.co' }, all);
    expect(reply).toEqual({ status: 200, body: { sent: true } });
  });

  it('refuses what is not an address or a code', async () => {
    const { all } = deps();
    expect((await proveInvite('Bearer jwt', { email: 'nope' }, all)).status).toBe(400);
    expect((await proveInvite('Bearer jwt', { code: '12' }, all)).status).toBe(400);
    expect((await proveInvite('Bearer jwt', null, all)).status).toBe(400);
  });
});

describe('giving the code', () => {
  it('hashes it as it was kept, and says whether it was right', async () => {
    const finish = vi.fn(() => Promise.resolve(false));
    const { all } = deps({ finish });
    const reply = await proveInvite('Bearer jwt', { code: '012345' }, all);
    expect(reply).toEqual({ status: 200, body: { proved: false } });
    expect(finish).toHaveBeenCalledWith('account', await sha256Hex('account:012345'));
  });
});
