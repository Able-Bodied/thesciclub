import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The four badges share one request, at most once per 5 s, none while hidden.
interface Account {
  status: string;
  userId: string | null;
}
const db = vi.hoisted(() => {
  const account: Account = { status: 'member', userId: 'u1' };
  return {
    calls: [] as string[],
    at: [] as number[],
    account,
    row: { chat_unread: 2, unseen: 5, unseen_outside_chat: 3, icon_kinds: 4 },
    icon: [] as number[],
  };
});

vi.mock('@/lib/account', () => ({ useAccount: () => db.account }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string) => {
      db.calls.push(name);
      db.at.push(Date.now());
      return Promise.resolve({ data: [db.row], error: null });
    },
  }),
}));
vi.mock('@/lib/push/notifications', () => ({
  showOnAppIcon: (n: number) => {
    db.icon.push(n);
    return Promise.resolve();
  },
}));

const { badgesChanged, holdBadgesFor, resetBadgesForTest } = await import('@/lib/badges');
const { unreadChanged, useUnreadThreads } = await import('@/lib/chat/unread');
const { announceNotificationsChanged, useUnseenNotifications } = await import(
  '@/lib/notifications'
);
const { useIconBadge } = await import('@/lib/icon-badge');

// Everything that draws a badge: the Chat dot, three bells, Me's dot, the icon.
function useEveryBadge() {
  const chat = useUnreadThreads().count;
  const bell = useUnseenNotifications();
  useUnseenNotifications();
  useUnseenNotifications();
  const me = useUnseenNotifications(true).count;
  useIconBadge();
  return { chat, bell: bell.count, loaded: bell.loaded, me };
}

const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  resetBadgesForTest();
  db.calls = [];
  db.at = [];
  db.icon = [];
  db.account = { status: 'member', userId: 'u1' };
  db.row = { chat_unread: 2, unseen: 5, unseen_outside_chat: 3, icon_kinds: 4 };
});
afterEach(() => {
  vi.useRealTimers();
});

describe('one badge request', () => {
  it('asks once on opening for every badge, and each draws its own number', async () => {
    const { result } = renderHook(useEveryBadge);
    await wait(0);
    expect(db.calls).toEqual(['my_badge_counts']);
    expect(result.current).toEqual({ chat: 2, bell: 5, loaded: true, me: 3 });
    expect(db.icon).toEqual([4]);
  });

  it('counts a change after a quiet spell within a second, and a burst once', async () => {
    renderHook(useEveryBadge);
    await wait(0);
    await wait(10_000);
    act(unreadChanged);
    await wait(999);
    expect(db.calls).toHaveLength(1);
    await wait(1);
    expect(db.calls).toHaveLength(2);
    // Twenty changes at once, from everything that asks: one more count.
    await wait(10_000);
    act(() => {
      for (let i = 0; i < 5; i += 1) {
        unreadChanged();
        announceNotificationsChanged();
        badgesChanged();
        window.dispatchEvent(new Event('focus'));
      }
    });
    await wait(30_000);
    expect(db.calls).toHaveLength(3);
  });

  it('counts at most once per 5 s however busy, and always after the last change', async () => {
    const { result } = renderHook(useEveryBadge);
    await wait(0);
    // A busy member: a change every 1.2 s for a minute.
    for (let i = 0; i < 50; i += 1) {
      act(badgesChanged);
      await wait(1200);
    }
    db.row = { chat_unread: 0, unseen: 1, unseen_outside_chat: 1, icon_kinds: 1 };
    act(badgesChanged);
    await wait(30_000);
    const times = db.at.slice(1);
    for (let i = 1; i < times.length; i += 1) {
      expect((times[i] ?? 0) - (times[i - 1] ?? 0)).toBeGreaterThanOrEqual(5000);
    }
    // 61 s of changes: the opening count and one per 5 s.
    expect(db.calls.length).toBeLessThanOrEqual(14);
    // The last change was counted.
    expect(result.current.chat).toBe(0);
  });

  it('counts nothing while the page is hidden, and once when it is back', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    renderHook(useEveryBadge);
    await wait(0);
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    for (let i = 0; i < 30; i += 1) {
      act(() => {
        badgesChanged();
        announceNotificationsChanged();
      });
      await wait(2000);
    }
    expect(db.calls).toHaveLength(1);
    visibility.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    await wait(0);
    expect(db.calls).toHaveLength(2);
    await wait(30_000);
    expect(db.calls).toHaveLength(2);
    visibility.mockRestore();
  });

  it('waits for this tab’s own read, then counts it and its echoes once', async () => {
    renderHook(useEveryBadge);
    await wait(0);
    await wait(10_000);
    let land: () => void = () => undefined;
    const read = new Promise<void>((resolve) => {
      land = resolve;
    });
    // The new message's notification arrives before the read is saved.
    act(() => {
      holdBadgesFor(read);
      badgesChanged();
    });
    await wait(3000);
    expect(db.calls).toHaveLength(1);
    db.row = { chat_unread: 0, unseen: 0, unseen_outside_chat: 0, icon_kinds: 0 };
    await act(async () => {
      land();
      await Promise.resolve();
    });
    // The read's own echoes: this member's row and their notification.
    act(badgesChanged);
    act(badgesChanged);
    await wait(30_000);
    expect(db.calls).toHaveLength(2);
  });

  it('counts nothing more once the last badge closes', async () => {
    const { unmount } = renderHook(useEveryBadge);
    await wait(0);
    act(unreadChanged);
    act(badgesChanged);
    expect(db.calls).toHaveLength(1);
    unmount();
    await wait(10_000);
    expect(db.calls).toHaveLength(1);
  });

  it('gives a suspended member the Chat dot only, and leaves the icon alone', async () => {
    db.account = { status: 'suspended', userId: 'u1' };
    const { result } = renderHook(useEveryBadge);
    await wait(0);
    expect(result.current).toEqual({ chat: 2, bell: 0, loaded: true, me: 0 });
    expect(db.icon).toEqual([]);
  });

  it('asks nothing for somebody who is not a member', async () => {
    db.account = { status: 'signed-out', userId: null };
    const { result } = renderHook(useEveryBadge);
    await wait(0);
    expect(db.calls).toEqual([]);
    expect(result.current).toEqual({ chat: 0, bell: 0, loaded: false, me: 0 });
  });

  it('never shows one member the last one’s numbers', async () => {
    const { result, rerender } = renderHook(useEveryBadge);
    await wait(0);
    db.account = { status: 'member', userId: 'u2' };
    db.row = { chat_unread: 0, unseen: 1, unseen_outside_chat: 1, icon_kinds: 1 };
    rerender();
    await wait(0);
    expect(db.calls).toHaveLength(2);
    expect(result.current).toEqual({ chat: 0, bell: 1, loaded: true, me: 1 });
  });
});
