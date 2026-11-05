import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A read in one tab clears the other tab's Chat dot, bell and app icon.
const db = vi.hoisted(() => {
  return {
    row: { chat_unread: 1, unseen: 1, unseen_outside_chat: 1, icon_kinds: 1 },
    calls: [] as string[],
    watched: [] as { table: string; filter: string | undefined; enabled: boolean | undefined }[],
  };
});

vi.mock('@/lib/account', () => ({ useAccount: () => ({ status: 'member', userId: 'u1' }) }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string) => {
      db.calls.push(name);
      return Promise.resolve({ data: [db.row], error: null });
    },
  }),
}));
vi.mock('@/lib/push/notifications', () => ({ showOnAppIcon: () => Promise.resolve() }));
vi.mock('@/lib/chat/realtime', () => ({
  useRealtimeRows: (o: { table: string; filter?: string; enabled?: boolean }) => {
    db.watched.push({ table: o.table, filter: o.filter, enabled: o.enabled });
  },
}));

/** Stands in for the browser's: delivers to every other open channel of the name. */
class FakeChannel {
  static open = new Set<FakeChannel>();
  onmessage: ((e: MessageEvent) => void) | null = null;
  readonly name: string;
  constructor(name: string) {
    this.name = name;
    FakeChannel.open.add(this);
  }
  postMessage(data: unknown) {
    for (const other of FakeChannel.open) {
      if (other !== this && other.name === this.name) other.onmessage?.({ data } as MessageEvent);
    }
  }
  close() {
    FakeChannel.open.delete(this);
  }
}

/** Another tab: a channel of its own, as the real one would be. */
function otherTab() {
  return new FakeChannel('club:read-elsewhere');
}

const { resetBadgesForTest, useBadgeRealtime } = await import('@/lib/badges');
const { unreadChanged, useUnreadThreads } = await import('@/lib/chat/unread');
const { announceNotificationsChanged, useUnseenNotifications } = await import(
  '@/lib/notifications'
);
const { useIconBadge } = await import('@/lib/icon-badge');
const { onReadElsewhere, tellOtherTabs } = await import('@/lib/read-elsewhere');

beforeEach(() => {
  vi.useFakeTimers();
  resetBadgesForTest();
  vi.stubGlobal('BroadcastChannel', FakeChannel);
  FakeChannel.open.clear();
  db.calls = [];
  db.watched = [];
  db.row = { chat_unread: 1, unseen: 1, unseen_outside_chat: 1, icon_kinds: 1 };
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// One request (my_badge_counts) now counts all three.
const cases = [
  { name: 'Chat dot', drawn: true, mount: () => useUnreadThreads().count },
  { name: 'bell', drawn: true, mount: () => useUnseenNotifications().count },
  {
    name: 'app icon',
    drawn: false,
    mount: () => {
      useIconBadge();
      return 0;
    },
  },
];

describe.each(cases)('$name in a second tab', ({ drawn, mount }) => {
  const counts = () => db.calls.filter((c) => c === 'my_badge_counts').length;

  it('recounts within the limit when another tab reads, and leaves nothing open after', async () => {
    const { result, unmount } = renderHook(mount);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(counts()).toBe(1);
    if (drawn) expect(result.current).toBe(1);

    // The first tab reads it all; the database now says 0.
    db.row = { chat_unread: 0, unseen: 0, unseen_outside_chat: 0, icon_kinds: 0 };
    // Well past the first count (5 s apart), so only the settling second.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    otherTab().postMessage('read');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(counts()).toBe(2);
    if (drawn) expect(result.current).toBe(0);

    unmount();
    expect(FakeChannel.open.size).toBe(1); // otherTab()'s only
    otherTab().postMessage('read');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(counts()).toBe(2);
  });
});

describe('the realtime for another device', () => {
  it('watches only this member’s own read positions and notifications', () => {
    renderHook(useBadgeRealtime);
    expect(db.watched).toHaveLength(2);
    expect(db.watched).toContainEqual({
      table: 'chat_thread_members',
      filter: 'member_id=eq.u1',
      enabled: true,
    });
    expect(db.watched).toContainEqual({
      table: 'notifications',
      filter: 'member_id=eq.u1',
      enabled: true,
    });
  });
});

describe('tellOtherTabs', () => {
  it('reaches other tabs, not its own', () => {
    const heard: string[] = [];
    const tab2 = otherTab();
    tab2.onmessage = () => heard.push('tab2');
    const stop = onReadElsewhere(() => heard.push('self'));
    tellOtherTabs();
    expect(heard).toEqual(['tab2']);
    stop();
  });

  it('is said by a chat read and by the bell marking seen or read', () => {
    const heard: number[] = [];
    const tab2 = otherTab();
    tab2.onmessage = () => heard.push(1);
    unreadChanged();
    announceNotificationsChanged();
    expect(heard).toEqual([1, 1]);
  });

  it('uses a storage event where BroadcastChannel is missing', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const heard: number[] = [];
    const stop = onReadElsewhere(() => heard.push(1));
    // What another tab's localStorage.setItem looks like here.
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'club:read-elsewhere', newValue: 'x' }),
    );
    window.dispatchEvent(new StorageEvent('storage', { key: 'something-else', newValue: 'x' }));
    expect(heard).toEqual([1]);
    const set = vi.spyOn(Storage.prototype, 'setItem');
    tellOtherTabs();
    expect(set).toHaveBeenCalledWith('club:read-elsewhere', expect.any(String));
    stop();
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'club:read-elsewhere', newValue: 'y' }),
    );
    expect(heard).toEqual([1]);
    set.mockRestore();
  });
});
