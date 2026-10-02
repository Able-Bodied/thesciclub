import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  steps: [] as string[],
  listed: [{ name: 'profile.webp' }] as { name: string }[],
  removeError: null as { message: string } | null,
  rpcError: null as { message: string; code?: string } | null,
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    storage: {
      from: () => ({
        list: (folder: string) => {
          db.steps.push(`list ${folder}`);
          return Promise.resolve({ data: db.listed, error: null });
        },
        remove: (paths: string[]) => {
          db.steps.push(`remove ${paths.join(',')}`);
          return Promise.resolve({ data: [], error: db.removeError });
        },
      }),
    },
    rpc: (name: string) => {
      db.steps.push(`rpc ${name}`);
      return Promise.resolve({ data: null, error: db.rpcError });
    },
    auth: {
      signOut: (options: { scope: string }) => {
        db.steps.push(`signOut ${options.scope}`);
        return Promise.resolve({ error: null });
      },
    },
  }),
}));
vi.mock('@/lib/push/notifications', () => ({
  forgetThisDevice: () => {
    db.steps.push('forget device');
    return Promise.resolve();
  },
}));
vi.mock('@/lib/chat/attachments', () => ({ resetAttachmentUrls: vi.fn() }));

const { deleteMyAccount } = await import('@/routes/me/delete-account-api');

beforeEach(() => {
  db.steps = [];
  db.listed = [{ name: 'profile.webp' }];
  db.removeError = null;
  db.rpcError = null;
});

describe('deleting your own account', () => {
  it('removes the photograph, then the device, then the account, then the session', async () => {
    expect(await deleteMyAccount('u1')).toEqual({ ok: true });
    expect(db.steps).toEqual([
      'list u1',
      'remove u1/profile.webp',
      'forget device',
      'rpc delete_my_account',
      'signOut local',
    ]);
  });

  it('skips the remove when there is no photograph', async () => {
    db.listed = [];
    await deleteMyAccount('u1');
    expect(db.steps).not.toContain('remove ');
    expect(db.steps).toContain('rpc delete_my_account');
  });

  // After the account is gone nobody could reach the file, so a face left in
  // the bucket would stay for ever.
  it('stops before the account when the photograph will not delete', async () => {
    db.removeError = { message: 'boom' };
    const result = await deleteMyAccount('u1');
    expect(result.ok).toBe(false);
    expect(db.steps).not.toContain('rpc delete_my_account');
  });

  it('keeps the session when the database refuses', async () => {
    db.rpcError = {
      message: 'An administrator’s account cannot be deleted from the app.',
      code: 'P0001',
    };
    const result = await deleteMyAccount('u1');
    expect(result.ok).toBe(false);
    expect(db.steps).not.toContain('signOut local');
  });
});
