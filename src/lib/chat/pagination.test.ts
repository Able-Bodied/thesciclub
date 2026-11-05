import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRealtimeRows } from '@/lib/chat/realtime';
import { useThreadMessages } from '@/lib/chat/threads';
import { resetTopicReadMarks } from '@/lib/chat/topic-read-mark';
import { useTopicPosts } from '@/lib/chat/topics';
import { pagedDatabase } from '@/test/paged-database';

// `rpc` is when a request is built; `sent` is when it is actually sent, which a
// Supabase request only is once awaited or `.then`ed. The topic's read marker
// was built and never sent for a month, and a test of `rpc` alone passed.
const state = vi.hoisted(() => {
  const topic: Record<string, unknown> = { id: 'topic', room_id: 'room' };
  return { tables: {}, rpc: vi.fn(), sent: vi.fn(), topic };
});
vi.mock('@/lib/account', () => ({ useAccount: () => ({ status: 'member', userId: 'me' }) }));
vi.mock('@/lib/chat/unread', () => ({ unreadChanged: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    ...pagedDatabase(state.tables),
    channel: () => {
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
    removeChannel: () => Promise.resolve('ok'),
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpc(name, args);
      const data =
        name === 'chat_my_threads'
          ? [{ id: 'thread', kind: 'direct' }]
          : name === 'chat_topic_for'
            ? [state.topic]
            : null;
      return {
        abortSignal: () => {
          state.sent(name, args);
          return Promise.resolve({ data, error: null });
        },
        then: (resolve: (value: unknown) => unknown) => {
          state.sent(name, args);
          return Promise.resolve(resolve({ data, error: null }));
        },
      };
    },
  }),
}));

beforeEach(() => {
  resetTopicReadMarks();
  state.rpc.mockClear();
  state.sent.mockClear();
  const rows = Array.from({ length: 1005 }, (_, id) => ({
    id: `row-${String(id).padStart(4, '0')}`,
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, id)).toISOString(),
    thread_id: 'thread',
    topic_id: 'topic',
    body: `Message ${id}`,
    author_id: 'other',
    attachments: [],
  }));
  state.tables = { chat_messages: rows, chat_posts: rows, chat_topic_reads: [] };
  state.topic = { id: 'topic', room_id: 'room' };
});

afterEach(() => vi.restoreAllMocks());

// The count was read just before this visit is recorded, so a first visit
// adds itself, unless it is the author's: their own is never a view.
describe('a topic’s views on a first visit', () => {
  it('counts somebody else’s first visit', async () => {
    state.topic = { id: 'topic', room_id: 'room', author_id: 'other', view_count: 2 };
    const { result } = renderHook(() => useTopicPosts('room', 'topic'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.topic?.viewCount).toBe(3);
    // The one topic, never the whole room's list.
    expect(state.sent).toHaveBeenCalledWith('chat_topic_for', { topic: 'topic' });
    expect(state.rpc).not.toHaveBeenCalledWith('chat_topics_for', expect.anything());
  });

  it('never counts the author’s own', async () => {
    state.topic = { id: 'topic', room_id: 'room', author_id: 'me', view_count: 0 };
    const { result } = renderHook(() => useTopicPosts('room', 'topic'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.topic?.viewCount).toBe(0);
  });
});

describe('long conversations and topics', () => {
  // A conversation reads its newest page only (the owner's speed report,
  // 2026-11-03); Show earlier brings the rest. thread-paging.test.ts has more.
  it('reads the newest page and marks through the newest message', async () => {
    const { result } = renderHook(() => useThreadMessages('thread'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.messages).toHaveLength(100);
    expect(result.current.hasEarlier).toBe(true);
    expect(result.current.messages[0]?.body).toBe('Message 905');
    expect(result.current.messages.at(-1)?.body).toBe('Message 1004');
    await waitFor(() => {
      expect(state.sent).toHaveBeenCalledWith('chat_mark_thread_read_through', {
        thread: 'thread',
        message: 'row-1004',
      });
    });
    expect(state.rpc).not.toHaveBeenCalledWith('chat_mark_thread_read', expect.anything());
  });
  it('delivers every topic post and uses the delivered read boundary', async () => {
    const { result } = renderHook(() => useTopicPosts('room', 'topic'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.posts).toHaveLength(1005);
    // Sent, not merely built: a view is recorded only if this reaches the
    // database.
    await waitFor(() => {
      expect(state.sent).toHaveBeenCalledWith('chat_mark_topic_read_through', {
        topic: 'topic',
        post: 'row-1004',
        device: 'desktop',
      });
    });
  });
});

describe('read markers in background tabs', () => {
  it('marks nothing while hidden and catches up when the conversation becomes visible', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    // As the conversation screen wires it: its realtime catches up on return.
    const { result } = renderHook(() => {
      const messages = useThreadMessages('thread');
      useRealtimeRows({ table: 'chat_messages', onChange: messages.reload });
      return messages;
    });
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(state.rpc).not.toHaveBeenCalledWith('chat_mark_thread_read_through', expect.anything());
    visibility.mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(state.rpc).toHaveBeenCalledWith('chat_mark_thread_read_through', {
        thread: 'thread',
        message: 'row-1004',
      });
    });
  });
});
