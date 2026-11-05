import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flushTopicRead,
  markTopicRead,
  resetTopicReadMarks,
  TOPIC_MARK_GAP_MS,
} from '@/lib/chat/topic-read-mark';
import { useTopicPosts } from '@/lib/chat/topics';
import { pagedDatabase } from '@/test/paged-database';

// `sent` is when a request actually goes, as in pagination.test.ts.
const state = vi.hoisted(() => {
  const tables: Record<string, Record<string, unknown>[]> = {};
  return { tables, sent: vi.fn(), fail: false };
});
vi.mock('@/lib/account', () => ({ useAccount: () => ({ status: 'member', userId: 'me' }) }));
vi.mock('@/lib/chat/unread', () => ({ unreadChanged: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    ...pagedDatabase(state.tables),
    rpc: (name: string, args: Record<string, unknown>) => {
      const data = name === 'chat_topic_for' ? [{ id: 'topic', room_id: 'room' }] : null;
      const result = () => ({
        data,
        error: state.fail && name === 'chat_mark_topic_read_through' ? { message: 'down' } : null,
      });
      return {
        abortSignal: () => {
          state.sent(name, args);
          return Promise.resolve(result());
        },
        then: (resolve: (value: unknown) => unknown) => {
          state.sent(name, args);
          return Promise.resolve(resolve(result()));
        },
      };
    },
  }),
}));

function post(n: number) {
  return {
    id: `post-${n}`,
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(),
    topic_id: 'topic',
    body: `Post ${n}`,
    author_id: 'other',
    attachments: [],
  };
}

function marks() {
  return state.sent.mock.calls
    .filter(([name]) => name === 'chat_mark_topic_read_through')
    .map(([, args]) => (args as { post: string }).post);
}

beforeEach(() => {
  resetTopicReadMarks();
  state.sent.mockClear();
  state.fail = false;
  state.tables = { chat_posts: [post(1), post(2)], chat_topic_reads: [] };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a topic is marked read only when something changed', () => {
  it('sends nothing when a reload finds the same newest post', async () => {
    const { result } = renderHook(() => useTopicPosts('room', 'topic'));
    await waitFor(() => {
      expect(marks()).toEqual(['post-2']);
    });
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        result.current.reload();
        await new Promise((r) => setTimeout(r, 0));
      });
    }
    await waitFor(() => {
      expect(state.sent.mock.calls.filter(([n]) => n === 'chat_topic_for')).toHaveLength(4);
    });
    expect(marks()).toEqual(['post-2']);
  });

  it('marks again on a reopen, so a waiting notice is still cleared', async () => {
    const first = renderHook(() => useTopicPosts('room', 'topic'));
    await waitFor(() => {
      expect(marks()).toEqual(['post-2']);
    });
    first.unmount();
    // A reopen inside the gap waits for it, and still goes.
    renderHook(() => useTopicPosts('room', 'topic'));
    await waitFor(
      () => {
        expect(marks()).toEqual(['post-2', 'post-2']);
      },
      { timeout: TOPIC_MARK_GAP_MS + 1000 },
    );
  });

  it('marks a new post that a reload brings, and sends the waiting one on leaving', async () => {
    const { result, unmount } = renderHook(() => useTopicPosts('room', 'topic'));
    await waitFor(() => {
      expect(marks()).toEqual(['post-2']);
    });
    state.tables.chat_posts = [post(1), post(2), post(3)];
    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(result.current.posts).toHaveLength(3);
    });
    // Inside the gap: waiting, not sent.
    expect(marks()).toEqual(['post-2']);
    unmount();
    expect(marks()).toEqual(['post-2', 'post-3']);
  });
});

describe('bursts', () => {
  it('sends one call per topic per gap, the newest last', () => {
    vi.useFakeTimers();
    markTopicRead('topic', 'post-1', true);
    markTopicRead('topic', 'post-2', false);
    markTopicRead('topic', 'post-3', false);
    markTopicRead('topic', 'post-4', false);
    // Another topic is not held up.
    markTopicRead('other', 'post-9', true);
    expect(marks()).toEqual(['post-1', 'post-9']);
    vi.advanceTimersByTime(TOPIC_MARK_GAP_MS - 1);
    expect(marks()).toEqual(['post-1', 'post-9']);
    vi.advanceTimersByTime(1);
    expect(marks()).toEqual(['post-1', 'post-9', 'post-4']);
    // Same post again, nothing new.
    vi.advanceTimersByTime(TOPIC_MARK_GAP_MS * 2);
    markTopicRead('topic', 'post-4', false);
    flushTopicRead('topic');
    expect(marks()).toEqual(['post-1', 'post-9', 'post-4']);
  });

  it('tries again after a failure', async () => {
    state.fail = true;
    markTopicRead('topic', 'post-1', true);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, TOPIC_MARK_GAP_MS + 10));
    state.fail = false;
    markTopicRead('topic', 'post-1', false);
    expect(marks()).toEqual(['post-1', 'post-1']);
  });
});
