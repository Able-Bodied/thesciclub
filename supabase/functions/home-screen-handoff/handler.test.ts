import { describe, expect, it, vi } from 'vitest';
import { type Deps, handOff } from './handler.ts';

const CODE = 'a'.repeat(43);

function deps(overrides: Partial<Deps> = {}): Deps {
  return {
    redeem: vi.fn(() => Promise.resolve('dana@example.com')),
    signInHash: vi.fn(() => Promise.resolve('the-hash')),
    ...overrides,
  };
}

describe('home-screen-handoff', () => {
  it('trades a live code for a one-time sign-in hash', async () => {
    const d = deps();
    expect(await handOff({ code: CODE }, d)).toEqual({
      status: 200,
      body: { token_hash: 'the-hash' },
    });
    expect(d.redeem).toHaveBeenCalledWith(CODE);
    expect(d.signInHash).toHaveBeenCalledWith('dana@example.com');
  });

  it('answers a malformed code without touching the database', async () => {
    for (const payload of [null, {}, { code: 42 }, { code: 'short' }, { code: `${CODE}!` }]) {
      const d = deps();
      expect((await handOff(payload, d)).status).toBe(404);
      expect(d.redeem).not.toHaveBeenCalled();
    }
  });

  it('answers an unknown, used or expired code the same, and makes no sign-in', async () => {
    const d = deps({ redeem: vi.fn(() => Promise.resolve(null)) });
    const reply = await handOff({ code: CODE }, d);
    expect(reply.status).toBe(404);
    expect((await handOff({ code: 'short' }, deps())).body).toEqual(reply.body);
    expect(d.signInHash).not.toHaveBeenCalled();
  });

  it('says so when Auth will not make the sign-in', async () => {
    const d = deps({ signInHash: vi.fn(() => Promise.resolve(null)) });
    expect((await handOff({ code: CODE }, d)).status).toBe(502);
  });
});
