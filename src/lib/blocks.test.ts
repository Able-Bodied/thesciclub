import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => ({
  calls: [] as [string, unknown][],
  error: null as { message: string; code: string } | null,
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string, args: unknown) => {
      rpc.calls.push([name, args]);
      return Promise.resolve({ data: null, error: rpc.error });
    },
  }),
}));

const { CANT_MESSAGE, blockExplainer, blockMember, unblockMember } = await import('@/lib/blocks');

beforeEach(() => {
  rpc.calls = [];
  rpc.error = null;
});

describe('blockExplainer', () => {
  it('says what is hidden, what is refused, and who is told', () => {
    const said = blockExplainer('Bo').join(' ');
    expect(said).toContain("You won't see Bo's posts, replies, messages, likes or reactions");
    expect(said).toContain('including rooms and groups you share');
    expect(said).toContain('Neither of you can message the other');
    expect(said).toContain('Bo is not told.');
    expect(said).toContain('administrators are');
    expect(said).toContain('Me → Settings');
  });

  it('never says user', () => {
    expect(blockExplainer('Bo').join(' ')).not.toMatch(/\buser/i);
  });
});

describe('the writes', () => {
  it('block and unblock by member id', async () => {
    expect(await blockMember('bo')).toEqual({ ok: true, value: null });
    expect(await unblockMember('bo')).toEqual({ ok: true, value: null });
    expect(rpc.calls).toEqual([
      ['block_member', { member: 'bo' }],
      ['unblock_member', { member: 'bo' }],
    ]);
  });

  it('passes the database’s own sentence through', async () => {
    rpc.error = { message: 'You cannot block yourself.', code: '22023' };
    expect(await blockMember('me')).toEqual({ ok: false, error: 'You cannot block yourself.' });
  });
});

describe('CANT_MESSAGE', () => {
  it('is the neutral sentence the database refuses with', () => {
    expect(CANT_MESSAGE).toBe("You can't message this member.");
  });
});

describe('the refusal a blocked member sees', () => {
  it('reaches the composer as the database said it, and nothing more', async () => {
    const { describeError } = await import('@/lib/describe-error');
    expect(
      describeError(
        { message: CANT_MESSAGE, code: '42501' },
        {
          attempt: 'Your message was not sent.',
          refused: 'You cannot write in this conversation.',
        },
      ),
    ).toBe(CANT_MESSAGE);
  });
});
