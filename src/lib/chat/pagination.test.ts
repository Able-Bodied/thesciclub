import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useThreadMessages } from '@/lib/chat/threads';
import { useTopicPosts } from '@/lib/chat/topics';
import { pagedDatabase } from '@/test/paged-database';

const state = vi.hoisted(() => ({ tables: {}, rpc: vi.fn() }));
vi.mock('@/lib/account', () => ({ useAccount: () => ({ status: 'member', userId: 'me' }) }));
vi.mock('@/lib/chat/unread', () => ({ unreadChanged: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    ...pagedDatabase(state.tables),
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpc(name, args);
      const data =
        name === 'chat_my_threads'
          ? [{ id: 'thread', kind: 'direct' }]
          : name === 'chat_topics_for'
            ? [{ id: 'topic', room_id: 'room' }]
            : null;
      return {
        abortSignal: () => Promise.resolve({ data, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(resolve({ data, error: null })),
      };
    },
  }),
}));

beforeEach(() => {
  state.rpc.mockClear();
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
});

afterEach(() => vi.restoreAllMocks());

describe('long conversations and topics', () => {
  it('delivers every message and marks only through the last delivered ID', async () => {
    const { result } = renderHook(() => useThreadMessages('thread'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.messages).toHaveLength(1005);
    expect(result.current.messages.at(-1)?.body).toBe('Message 1004');
    expect(state.rpc).toHaveBeenCalledWith('chat_mark_thread_read_through', {
      thread: 'thread',
      message: 'row-1004',
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
    expect(state.rpc).toHaveBeenCalledWith('chat_mark_topic_read_through', {
      topic: 'topic',
      post: 'row-1004',
    });
  });
});

describe('read markers in background tabs', () => {
  it('marks nothing while hidden and catches up when the conversation becomes visible', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const { result } = renderHook(() => useThreadMessages('thread'));
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
