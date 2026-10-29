import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The three badges recount at most once per RECOUNT_MS, and not after closing.
const db = vi.hoisted(() => ({ calls: [] as string[], onChange: [] as (() => void)[] }));

vi.mock('@/lib/account', () => ({ useAccount: () => ({ status: 'member', userId: 'u1' }) }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string) => {
      db.calls.push(name);
      return Promise.resolve({ data: 1, error: null });
    },
  }),
}));
vi.mock('@/lib/push/notifications', () => ({ showOnAppIcon: () => Promise.resolve() }));
vi.mock('@/lib/chat/realtime', () => ({
  useRealtimeRows: (o: { onChange: () => void }) => {
    db.onChange.push(o.onChange);
  },
}));

const { unreadChanged, useUnreadThreads } = await import('@/lib/chat/unread');
const { useUnseenNotifications } = await import('@/lib/notifications');
const { useIconBadge } = await import('@/lib/icon-badge');

const latestOnChange = () => db.onChange.at(-1) ?? (() => undefined);

const cases = [
  { name: 'Chat dot', rpc: 'chat_unread_count', mount: useUnreadThreads, poke: unreadChanged },
  {
    name: 'bell',
    rpc: 'my_unseen_notification_count',
    mount: useUnseenNotifications,
    poke: () => {
      latestOnChange()();
    },
  },
  {
    name: 'app icon',
    rpc: 'my_unseen_notification_kinds',
    mount: useIconBadge,
    poke: () => {
      latestOnChange()();
    },
  },
];

beforeEach(() => {
  vi.useFakeTimers();
  db.calls = [];
  db.onChange = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe.each(cases)('$name', ({ rpc, mount, poke }) => {
  const counts = () => db.calls.filter((c) => c === rpc).length;

  it('counts on opening, at once for the first change, and once for a burst after it', async () => {
    renderHook(() => {
      mount();
    });
    expect(counts()).toBe(1);
    act(poke);
    expect(counts()).toBe(2);
    for (let i = 0; i < 20; i += 1) act(poke);
    expect(counts()).toBe(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(counts()).toBe(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(counts()).toBe(3);
  });

  it('counts nothing more once the screen closes', async () => {
    const { unmount } = renderHook(() => {
      mount();
    });
    act(poke);
    act(poke);
    expect(counts()).toBe(2);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(counts()).toBe(2);
  });
});
