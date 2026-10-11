import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Answer {
  data: unknown;
  error: { message: string } | null;
}

const db = vi.hoisted(() => {
  const answer: Answer = { data: true, error: null };
  return { asked: [] as { name: string; args: unknown }[], answer };
});

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string, args: unknown) => {
      db.asked.push({ name, args });
      return Promise.resolve(db.answer);
    },
  }),
}));

const { captureInviteToken, claimHeldInvite, forgetInviteToken, heldInviteToken } = await import(
  '@/lib/invite-token'
);

beforeEach(() => {
  window.localStorage.clear();
  db.asked = [];
  db.answer = { data: true, error: null };
});

describe('keeping the token', () => {
  it('keeps what ?invite= carries, under the contract’s key', () => {
    expect(captureInviteToken('?invite=abc123&next=%2Fpeers')).toBe('abc123');
    expect(window.localStorage.getItem('sciclub.inviteToken')).toBe('abc123');
  });

  it('keeps nothing when there is none, and leaves a held one alone', () => {
    expect(captureInviteToken('?next=%2Fpeers')).toBeNull();
    window.localStorage.setItem('sciclub.inviteToken', 'held');
    expect(captureInviteToken('')).toBe('held');
  });

  it('ignores an empty token', () => {
    expect(captureInviteToken('?invite=%20')).toBeNull();
  });

  it('lets go on request', () => {
    captureInviteToken('?invite=abc');
    forgetInviteToken();
    expect(heldInviteToken()).toBeNull();
  });
});

describe('claimHeldInvite', () => {
  it('does nothing without a token', async () => {
    expect(await claimHeldInvite()).toBe('none');
    expect(db.asked).toEqual([]);
  });

  it('claims with the token and lets it go when claimed', async () => {
    captureInviteToken('?invite=abc');
    expect(await claimHeldInvite()).toBe('claimed');
    expect(db.asked).toEqual([{ name: 'claim_invite', args: { token: 'abc' } }]);
    expect(heldInviteToken()).toBeNull();
  });

  it('lets it go when refused too: false never says why, and trying again would not help', async () => {
    captureInviteToken('?invite=abc');
    db.answer = { data: false, error: null };
    expect(await claimHeldInvite()).toBe('refused');
    expect(heldInviteToken()).toBeNull();
  });

  it('keeps it when the call itself failed, so the next try can claim', async () => {
    captureInviteToken('?invite=abc');
    db.answer = { data: null, error: { message: 'offline' } };
    expect(await claimHeldInvite()).toBe('failed');
    expect(heldInviteToken()).toBe('abc');
  });
});
