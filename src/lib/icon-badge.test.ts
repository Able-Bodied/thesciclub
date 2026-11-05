import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  kinds: 2,
  error: null as { message: string } | null,
  calls: [] as string[],
  icon: [] as number[],
}));

vi.mock('@/lib/account', () => ({ useAccount: () => ({ status: 'member', userId: 'u1' }) }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string) => {
      db.calls.push(name);
      return Promise.resolve({
        data: [{ chat_unread: 0, unseen: 0, unseen_outside_chat: 0, icon_kinds: db.kinds }],
        error: db.error,
      });
    },
  }),
}));
vi.mock('@/lib/push/notifications', () => ({
  showOnAppIcon: (count: number) => {
    db.icon.push(count);
    return Promise.resolve();
  },
}));
const { resetBadgesForTest } = await import('@/lib/badges');
const { useIconBadge } = await import('@/lib/icon-badge');
const { announceNotificationsChanged } = await import('@/lib/notifications');

beforeEach(() => {
  db.kinds = 2;
  db.error = null;
  db.calls = [];
  db.icon = [];
  resetBadgesForTest();
});

describe('useIconBadge', () => {
  it('puts the number of kinds on the icon, and clears it when the bell is opened', async () => {
    renderHook(() => {
      useIconBadge();
    });
    await vi.waitFor(() => {
      expect(db.icon).toEqual([2]);
    });
    expect(db.calls).toEqual(['my_badge_counts']);

    db.kinds = 0;
    // The badges count at most once per 5 s (src/lib/badges.ts).
    vi.useFakeTimers();
    announceNotificationsChanged();
    await vi.advanceTimersByTimeAsync(5000);
    vi.useRealTimers();
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
