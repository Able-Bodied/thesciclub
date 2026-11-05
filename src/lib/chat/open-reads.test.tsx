import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePostLikes } from '@/lib/chat/likes';
import { useTopicOpeningPosts } from '@/lib/chat/opening-posts';
import { announcePostViewsChanged, usePostViews, VISIT_WAIT_MS } from '@/lib/chat/views';

/** Opening a topic or a room: each read once, not again straight after. */

const db = vi.hoisted(() => ({ requests: [] as string[] }));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'me', isAdmin: false, displayName: 'Alex' }),
}));
vi.mock('@/lib/announce', () => ({ useAnnounce: () => () => undefined }));
vi.mock('@/lib/supabase', () => {
  const answer = (name: string) => {
    db.requests.push(name);
    const data =
      name === 'chat_topic_opening_posts'
        ? [
            { topic_id: 't1', post_id: 'p1' },
            { topic_id: 't2', post_id: 'p2' },
          ]
        : [];
    return Promise.resolve({ data, error: null });
  };
  const chain = (name: string): unknown => {
    const query: Record<string, unknown> = new Proxy(
      {},
      {
        get: (_, key) =>
          key === 'then'
            ? (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
                answer(name).then(resolve, reject)
            : () => query,
      },
    );
    return query;
  };
  return {
    getSupabase: () => ({
      from: (table: string) => chain(table),
      rpc: (fn: string) => chain(fn),
    }),
  };
});

const settle = async () => {
  for (let i = 0; i < 10; i += 1) {
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }
};
const count = (name: string) => db.requests.filter((r) => r === name).length;

afterEach(() => {
  vi.useRealTimers();
  db.requests = [];
});

describe("a topic's view counts", () => {
  it('are read once, after this visit is counted, not before it too', async () => {
    renderHook(() => usePostViews(['p1', 'p2'], { afterVisit: true }));
    await settle();
    expect(count('chat_post_view_counts')).toBe(0);
    // The read-through write landed (lib/chat/topics.ts).
    act(() => {
      announcePostViewsChanged();
    });
    await settle();
    // Was 2: one as the posts landed, one after the write.
    expect(count('chat_post_view_counts')).toBe(1);
  });

  it('are read anyway when the visit is never counted', async () => {
    vi.useFakeTimers();
    renderHook(() => usePostViews(['p1'], { afterVisit: true }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(VISIT_WAIT_MS);
    });
    expect(count('chat_post_view_counts')).toBe(1);
  });

  it('are read at once elsewhere (Home)', async () => {
    renderHook(() => usePostViews(['p1']));
    await settle();
    expect(count('chat_post_view_counts')).toBe(1);
  });
});

describe("a room's opening posts, read again on (re)subscribe", () => {
  it('keep their likes drawn: the likes are read once, not twice', async () => {
    const room = renderHook(() => {
      const openers = useTopicOpeningPosts(['t1', 't2']);
      const likes = usePostLikes(
        [...openers.byTopic.values()].filter((id): id is string => id !== null),
      );
      return { openers, likes };
    });
    await settle();
    expect(count('chat_post_likes')).toBe(1);
    db.requests = [];
    // What room-page.tsx's catch-up does on SUBSCRIBED.
    act(() => {
      room.result.current.likes.reload();
      room.result.current.openers.reload();
    });
    await settle();
    // Was 2: the openers cleared, the likes with them, and read once more.
    expect(count('chat_post_likes')).toBe(1);
    expect(count('chat_topic_opening_posts')).toBe(1);
    expect(room.result.current.openers.byTopic.size).toBe(2);
  });
});
