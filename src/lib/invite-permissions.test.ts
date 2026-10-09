import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInvitePermissions } from '@/lib/invite-permissions';

const db = vi.hoisted(() => ({
  row: { can_invite: false, unlimited: false },
  error: null as { message: string } | null,
  rpc: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string) => {
      db.rpc(name);
      return { abortSignal: () => Promise.resolve({ data: [db.row], error: db.error }) };
    },
  }),
}));
beforeEach(() => {
  db.row = { can_invite: true, unlimited: false };
  db.error = null;
  db.rpc.mockClear();
});
describe('invite permissions', () => {
  it('reads the database permission rather than assuming every member can invite', async () => {
    const { result } = renderHook(() => useInvitePermissions('member'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.canInvite).toBe(true);
    expect(result.current.unlimited).toBe(false);
    expect(db.rpc).toHaveBeenCalledWith('my_invite_permissions');
  });
  it('refreshes unlimited access after a representative link changes', async () => {
    db.row = { can_invite: true, unlimited: true };
    const { result } = renderHook(() => useInvitePermissions('member'));
    await waitFor(() => {
      expect(result.current.unlimited).toBe(true);
    });
    db.row = { can_invite: false, unlimited: false };
    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.canInvite).toBe(false);
    expect(result.current.unlimited).toBe(false);
  });
  it('fails closed with a retry instead of guessing a ten-invite cap', async () => {
    db.error = { message: 'Offline' };
    const { result } = renderHook(() => useInvitePermissions('member'));
    await waitFor(() => {
      expect(result.current.error).toBe('Offline');
    });
    expect(result.current.canInvite).toBe(false);
    db.error = null;
    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(result.current.canInvite).toBe(true);
    });
    expect(result.current.error).toBeNull();
  });
  it('waits for the signed-in account instead of redirecting using signed-out permissions', async () => {
    const renders: { id: string | null; loading: boolean }[] = [];
    const { result, rerender } = renderHook(
      ({ id }) => {
        const permission = useInvitePermissions(id);
        renders.push({ id, loading: permission.loading });
        return permission;
      },
      { initialProps: { id: null as string | null } },
    );
    expect(result.current.loading).toBe(false);
    rerender({ id: 'member' });
    expect(renders.find((render) => render.id === 'member')?.loading).toBe(true);
    expect(result.current.loading).toBe(true);
    await waitFor(() => {
      expect(result.current.canInvite).toBe(true);
    });
  });

  it('does not read permissions without an account', () => {
    const { result } = renderHook(() => useInvitePermissions(null));
    expect(result.current.canInvite).toBe(false);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
