import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The app icon counts kinds of notification (icon-badge.ts), not conversations.
const db = vi.hoisted(() => ({ count: 3, icon: [] as number[] }));

vi.mock('@/lib/account', () => ({ useAccount: () => ({ status: 'member' }) }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: () =>
      Promise.resolve({
        data: [{ chat_unread: db.count, unseen: 0, unseen_outside_chat: 0, icon_kinds: 0 }],
        error: null,
      }),
  }),
}));
vi.mock('@/lib/push/notifications', () => ({
  showOnAppIcon: (count: number) => {
    db.icon.push(count);
    return Promise.resolve();
  },
}));

const { unreadChanged, useUnreadThreads } = await import('@/lib/chat/unread');
const { resetBadgesForTest } = await import('@/lib/badges');

beforeEach(() => {
  resetBadgesForTest();
  db.icon = [];
});

describe('useUnreadThreads', () => {
  it('counts conversations for the Chat tab, and leaves the app icon alone', async () => {
    const { result } = renderHook(() => useUnreadThreads());
    await vi.waitFor(() => {
      expect(result.current.count).toBe(3);
    });
    db.count = 0;
    unreadChanged();
    await vi.waitFor(() => {
      expect(result.current.count).toBe(0);
    });
    expect(db.icon).toEqual([]);
  });
});
