import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMyInvite, MENTOR_ALLOWANCE, resendMyInvite } from '@/routes/invites/mentor-invites';

const db = vi.hoisted(() => {
  const answer: { data: { id: string } | null; error: { message: string; code?: string } | null } =
    { data: { id: 'new-1' }, error: null };
  return { rpc: [] as [string, Record<string, unknown>][], answer, inserts: 0 };
});
const send = vi.hoisted(() => {
  const result: { ok: boolean; error?: string } = { ok: true };
  return { ids: [] as string[], result };
});

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      db.rpc.push([name, args]);
      return Promise.resolve(db.answer);
    },
    // A direct insert is `permission denied for table invites` since
    // 20261012000000; if anything still reached for one, it would count here.
    from: () => ({
      insert: () => {
        db.inserts += 1;
        return Promise.resolve({
          error: { code: '42501', message: 'permission denied for table invites' },
        });
      },
    }),
  }),
}));
vi.mock('@/lib/send-invite', () => ({
  SEND_FAILED: 'The invite is on the list, but the email did not go out. Use Resend.',
  addedButNotSent: (reason: string) =>
    `The invite is on the list, but the email did not go out. ${reason}`,
  sendInvite: (id: string) => {
    send.ids.push(id);
    return Promise.resolve(send.result);
  },
}));

beforeEach(() => {
  db.rpc = [];
  db.inserts = 0;
  db.answer = { data: { id: 'new-1' }, error: null };
  send.ids = [];
  send.result = { ok: true };
});

describe('a mentor adding an invite', () => {
  it('goes through create_my_invite with the address and note, never a direct insert', async () => {
    await expect(createMyInvite({ email: 'dana@example.com', note: 'Rugby' })).resolves.toEqual({
      ok: true,
    });
    expect(db.rpc).toEqual([
      ['create_my_invite', { raw_email: 'dana@example.com', note: 'Rugby', p_organization: null }],
    ]);
    expect(db.inserts).toBe(0);
  });

  // The owner, 2026-10-30: an org admin of several says which it is for.
  it('says which organization the invite is for', async () => {
    await createMyInvite({ email: 'dana@example.com', note: null, organizationId: 'o1' });
    expect(db.rpc).toContainEqual([
      'create_my_invite',
      { raw_email: 'dana@example.com', note: null, p_organization: 'o1' },
    ]);
  });

  it('emails the link of the invite that was just made', async () => {
    await createMyInvite({ email: 'dana@example.com', note: null });
    expect(send.ids).toEqual(['new-1']);
  });

  it('emails nothing when the allowance is spent, and says so', async () => {
    db.answer = {
      data: null,
      error: { code: '42501', message: 'You cannot add another invite.' },
    };
    const result = await createMyInvite({ email: 'dana@example.com', note: null });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(new RegExp(`used all ${MENTOR_ALLOWANCE} of your invites`));
    expect(send.ids).toEqual([]);
  });

  it('says the address is already on the list when it is', async () => {
    db.answer = {
      data: null,
      error: { code: '23505', message: 'That email address is already on the list' },
    };
    const result = await createMyInvite({ email: 'dana@example.com', note: null });
    expect(result.error).toMatch(/email address is already on the club’s list/);
  });

  it('is still ok, with the reason, when only the email failed', async () => {
    send.result = { ok: false, error: 'The email service did not take it. Try again in a minute.' };
    const result = await createMyInvite({ email: 'dana@example.com', note: null });
    expect(result).toEqual({
      ok: true,
      sendError:
        'The invite is on the list, but the email did not go out. The email service did not take it. Try again in a minute.',
    });
  });

  it('resends by invite id', async () => {
    await expect(resendMyInvite('inv-9')).resolves.toEqual({ ok: true });
    expect(send.ids).toEqual(['inv-9']);
  });
});
