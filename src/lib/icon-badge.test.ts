import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  kinds: 2,
  error: null as { message: string } | null,
  calls: [] as string[],
  icon: [] as number[],
  watched: [] as { table: string; filter: string | undefined }[],
}));

vi.mock('@/lib/account', () => ({ useAccount: () => ({ status: 'member', userId: 'u1' }) }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string) => {
      db.calls.push(name);
      return Promise.resolve({ data: db.kinds, error: db.error });
    },
  }),
}));
vi.mock('@/lib/push/notifications', () => ({
  showOnAppIcon: (count: number) => {
    db.icon.push(count);
    return Promise.resolve();
  },
}));
vi.mock('@/lib/chat/realtime', () => ({
  useRealtimeRows: (o: { table: string; filter?: string }) => {
    db.watched.push({ table: o.table, filter: o.filter });
  },
}));

const { useIconBadge } = await import('@/lib/icon-badge');
const { announceNotificationsChanged } = await import('@/lib/notifications');

beforeEach(() => {
  db.kinds = 2;
  db.error = null;
  db.calls = [];
  db.icon = [];
  db.watched = [];
});

describe('useIconBadge', () => {
  it('puts the number of kinds on the icon, and clears it when the bell is opened', async () => {
    renderHook(() => {
      useIconBadge();
    });
    await vi.waitFor(() => {
      expect(db.icon).toEqual([2]);
    });
    expect(db.calls).toEqual(['my_unseen_notification_kinds']);
    expect(db.watched).toContainEqual({ table: 'notifications', filter: 'member_id=eq.u1' });

    db.kinds = 0;
    announceNotificationsChanged();
    await vi.waitFor(() => {
      expect(db.icon).toEqual([2, 0]);
    });
  });

  // Before the migration is live: the icon keeps what the last push said.
  it('leaves the icon alone when the count cannot be read', async () => {
    db.error = { message: 'Could not find the function' };
    renderHook(() => {
      useIconBadge();
    });
    await vi.waitFor(() => {
      expect(db.calls).toHaveLength(1);
    });
    await Promise.resolve();
    expect(db.icon).toEqual([]);
  });
});
