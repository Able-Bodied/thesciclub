import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The four badges share one request and one RECOUNT_MS limit, and stop on closing.
interface Account {
  status: string;
  userId: string | null;
}
const db = vi.hoisted(() => {
  const account: Account = { status: 'member', userId: 'u1' };
  return {
    calls: [] as string[],
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

const { badgesChanged, resetBadgesForTest } = await import('@/lib/badges');
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

  it('counts the first change at once, then one more per burst, whatever asked', async () => {
    renderHook(useEveryBadge);
    await wait(0);
    act(unreadChanged);
    expect(db.calls).toHaveLength(2);
    act(() => {
      unreadChanged();
      announceNotificationsChanged();
      badgesChanged();
      window.dispatchEvent(new Event('focus'));
    });
    expect(db.calls).toHaveLength(2);
    await wait(1500);
    expect(db.calls).toHaveLength(3);
    await wait(10_000);
    expect(db.calls).toHaveLength(3);
  });

  it('counts nothing more once the last badge closes', async () => {
    const { unmount } = renderHook(useEveryBadge);
    await wait(0);
    act(unreadChanged);
    act(badgesChanged);
    expect(db.calls).toHaveLength(2);
    unmount();
    await wait(10_000);
    expect(db.calls).toHaveLength(2);
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
