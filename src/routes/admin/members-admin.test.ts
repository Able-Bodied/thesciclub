import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AdminInvite,
  createInvite,
  deliveryNote,
  inviteLabel,
  isOldPhoneInvite,
  reinviteByEmail,
  removeAndBlock,
  withdrawnInvites,
} from '@/routes/admin/members-admin';

const calls = vi.hoisted(() => ({
  log: [] as string[],
  rpc: new Map<string, { data?: unknown; error?: { message: string; code?: string } | null }>(),
}));
const send = vi.hoisted(() => {
  const result: { ok: boolean; error?: string } = { ok: true };
  return { result };
});

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.log.push(`${name}(${Object.values(args).join(',')})`);
      const answer = calls.rpc.get(name) ?? {};
      return Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null });
    },
    storage: {
      from: () => ({
        list: () => Promise.resolve({ data: [], error: null }),
        remove: () => Promise.resolve({ data: [], error: null }),
      }),
    },
  }),
}));
vi.mock('@/lib/send-invite', () => ({
  SEND_FAILED: 'The invite is on the list, but the email did not go out. Use Resend.',
  addedButNotSent: (reason: string) =>
    `The invite is on the list, but the email did not go out. ${reason}`,
  sendInvite: (id: string) => {
    calls.log.push(`send(${id})`);
    return Promise.resolve(send.result);
  },
}));

const invite = (o: Partial<AdminInvite> = {}): AdminInvite => ({
  id: 'i1',
  email: 'dana@example.com',
  phone: null,
  sentAt: null,
  claimedAt: null,
  status: 'pending',
  note: null,
  createdAt: '2026-10-01T00:00:00Z',
  invitedByOrganization: null,
  invitedByMember: null,
  invitedByMemberIsAdmin: undefined,
  heldBy: null,
  heldByStatus: null,
  hasAccount: false,
  ...o,
});

beforeEach(() => {
  calls.log = [];
  calls.rpc.clear();
  send.result = { ok: true };
});

describe('adding an invite', () => {
  it('puts the address on the list first, then emails that invite', async () => {
    calls.rpc.set('admin_create_invite', { data: { id: 'new-1' } });
    const result = await createInvite({
      email: 'dana@example.com',
      organizationId: null,
      note: null,
    });
    expect(result).toEqual({ ok: true });
    expect(calls.log).toEqual(['admin_create_invite(dana@example.com,,)', 'send(new-1)']);
  });

  it('sends nothing when the database refuses the address', async () => {
    calls.rpc.set('admin_create_invite', {
      error: { message: 'That email address is blocked from the club and cannot be invited' },
    });
    const result = await createInvite({ email: 'x@example.com', organizationId: null, note: null });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/blocked from the club/);
    expect(calls.log.some((l) => l.startsWith('send('))).toBe(false);
  });

  // The invite exists and spends nothing an administrator can see is wrong, so
  // this is not a failure: reporting one would be answered by adding it again.
  it('is still ok when only the email failed, and says what to do', async () => {
    calls.rpc.set('admin_create_invite', { data: { id: 'new-1' } });
    send.result = { ok: false, error: 'The email service did not take it. Try again in a minute.' };
    const result = await createInvite({
      email: 'dana@example.com',
      organizationId: null,
      note: null,
    });
    expect(result).toEqual({
      ok: true,
      sendError:
        'The invite is on the list, but the email did not go out. The email service did not take it. Try again in a minute.',
    });
  });
});

describe('removing a member and blocking the way back', () => {
  const emailMember = { id: 'm1', email: 'nuisance@example.com', phone: '14085550150' };

  // Block first. If the removal then fails the address is barred and the
  // member is visibly still there; the other order can leave somebody removed
  // and free to be invited again, and look like it worked.
  it('blocks the address before it removes the member', async () => {
    await expect(removeAndBlock(emailMember, 'Harassing')).resolves.toEqual({ ok: true });
    expect(calls.log).toEqual([
      'admin_block_email(nuisance@example.com,Harassing)',
      'admin_delete_member(m1)',
    ]);
  });

  it('removes nobody when the block is refused', async () => {
    calls.rpc.set('admin_block_email', {
      error: { message: 'An administrator cannot be blocked from the application' },
    });
    const result = await removeAndBlock(emailMember, null);
    expect(result.ok).toBe(false);
    expect(calls.log).toEqual(['admin_block_email(nuisance@example.com,)']);
  });

  it('says the address is blocked when only the removal failed', async () => {
    calls.rpc.set('admin_delete_member', { error: { message: 'No such member' } });
    const result = await removeAndBlock(emailMember, null);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(
      /nuisance@example\.com is blocked, but the member was not removed/,
    );
  });

  // A phone account that never added an email: blocked by number, which
  // removes the member inside the function; deleting again is then "No such
  // member", which is the first call having done it.
  it('blocks a member with no email by number, and treats "no such member" as done', async () => {
    calls.rpc.set('admin_delete_member', { error: { message: 'No such member' } });
    const result = await removeAndBlock({ id: 'm2', email: null, phone: '14085550150' }, 'x');
    expect(result).toEqual({ ok: true });
    expect(calls.log[0]).toBe('admin_block_number(14085550150,x)');
  });

  it('refuses plainly when there is neither an address nor a number to block', async () => {
    const result = await removeAndBlock({ id: 'm3', email: null, phone: null }, null);
    expect(result.ok).toBe(false);
    expect(calls.log).toEqual([]);
  });
});

describe('re-inviting an old phone invite by email', () => {
  const old = invite({ id: 'p1', email: null, phone: '14085551234', note: 'Met at rugby' });

  it('is told apart from an email invite', () => {
    expect(isOldPhoneInvite(old)).toBe(true);
    expect(isOldPhoneInvite(invite())).toBe(false);
    expect(inviteLabel(old)).toBe('14085551234');
    expect(inviteLabel(invite())).toBe('dana@example.com');
  });

  it('adds the new invite, emails it, then withdraws the phone one', async () => {
    calls.rpc.set('admin_create_invite', { data: { id: 'new-1' } });
    const result = await reinviteByEmail(old, 'dana@example.com', []);
    expect(result).toEqual({ ok: true });
    expect(calls.log).toEqual([
      'admin_create_invite(dana@example.com,,Met at rugby)',
      'send(new-1)',
      'admin_revoke_invite(p1)',
    ]);
  });

  it('keeps the organization that vouched, matched by name', async () => {
    calls.rpc.set('admin_create_invite', { data: { id: 'new-1' } });
    await reinviteByEmail({ ...old, invitedByOrganization: 'NorCal SCI' }, 'dana@example.com', [
      { id: 'org1', name: 'NorCal SCI', shortCode: 'NCS' },
    ]);
    expect(calls.log[0]).toBe('admin_create_invite(dana@example.com,org1,Met at rugby)');
  });

  it('leaves the phone invite alone when the new one was refused', async () => {
    calls.rpc.set('admin_create_invite', {
      error: { message: 'That email address is already on the list', code: '23505' },
    });
    const result = await reinviteByEmail(old, 'dana@example.com', []);
    expect(result.ok).toBe(false);
    expect(calls.log.some((l) => l.startsWith('admin_revoke_invite'))).toBe(false);
  });

  it('does not try to withdraw a phone invite somebody already used', async () => {
    calls.rpc.set('admin_create_invite', { data: { id: 'new-1' } });
    await reinviteByEmail({ ...old, status: 'consumed' }, 'dana@example.com', []);
    expect(calls.log.some((l) => l.startsWith('admin_revoke_invite'))).toBe(false);
  });
});

describe('where an invite’s link has got to', () => {
  it('says not sent, sent, and opened', () => {
    expect(deliveryNote(invite())).toBe('link not sent yet');
    expect(deliveryNote(invite({ sentAt: '2026-10-03T12:00:00Z' }))).toBe('link sent Oct 3');
    expect(
      deliveryNote(invite({ sentAt: '2026-10-03T12:00:00Z', claimedAt: '2026-10-04T12:00:00Z' })),
    ).toBe('link sent Oct 3, opened Oct 4');
  });

  it('says nothing for a withdrawn invite or an old phone one', () => {
    expect(deliveryNote(invite({ status: 'revoked' }))).toBeNull();
    expect(deliveryNote(invite({ email: null, phone: '14085551234' }))).toBeNull();
  });
});

describe('the withdrawn list by address', () => {
  it('matches addresses whatever their case', () => {
    const rows = withdrawnInvites([
      invite({ id: 'a', email: 'Dana@Example.com', status: 'revoked' }),
      invite({ id: 'b', email: 'dana@example.com', status: 'pending' }),
    ]);
    expect(rows).toEqual([]);
  });

  it('keeps an old phone invite in the list under its number', () => {
    const rows = withdrawnInvites([
      invite({ id: 'p', email: null, phone: '14085551234', status: 'revoked' }),
    ]);
    expect(rows.map((r) => r.invite.id)).toEqual(['p']);
  });
});
