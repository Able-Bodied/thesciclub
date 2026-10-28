import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The app icon counts kinds of notification now (icon-badge.ts), not this.
const db = vi.hoisted(() => ({ count: 3, icon: [] as number[] }));

vi.mock('@/lib/account', () => ({ useAccount: () => ({ status: 'member' }) }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ rpc: () => Promise.resolve({ data: db.count, error: null }) }),
}));
vi.mock('@/lib/push/notifications', () => ({
  showOnAppIcon: (count: number) => {
    db.icon.push(count);
    return Promise.resolve();
  },
}));

const { unreadChanged, useUnreadThreads } = await import('@/lib/chat/unread');

beforeEach(() => {
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
