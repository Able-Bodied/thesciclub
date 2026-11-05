import { act, renderHook } from '@testing-library/react';
import { useMemo } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pagedDatabase } from '@/test/paged-database';

// Every request a conversation or a topic sends when the member comes back
// after new messages or replies arrived while the page was hidden.
const state = vi.hoisted(() => {
  const tables: Record<string, Record<string, unknown>[]> = {};
  return { tables, sent: [] as string[] };
});
// Each answer takes a moment, as over the network.
const later = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 80);
  });
vi.mock('@/lib/account', () => ({ useAccount: () => ({ status: 'member', userId: 'me' }) }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => {
    const db = pagedDatabase(state.tables);
    return {
      from: (table: string) => {
        const query = db.from(table);
        const { then, maybeSingle } = query;
        query.then = (resolve) => {
          state.sent.push(table);
          return later().then(() => then(resolve));
        };
        query.maybeSingle = () => {
          state.sent.push(table);
          return later().then(maybeSingle);
        };
        return query;
      },
      channel: () => {
        const channel = { on: () => channel, subscribe: () => channel };
        return channel;
      },
      removeChannel: () => Promise.resolve('ok'),
      rpc: (name: string) => {
        const data =
          name === 'chat_my_threads'
            ? [{ id: 'thread', kind: 'direct' }]
            : name === 'chat_topic_for'
              ? [{ id: 'topic', room_id: 'room', author_id: 'other', view_count: 1 }]
              : name === 'my_badge_counts'
                ? [{ chat_unread: 0, unseen: 0, unseen_outside_chat: 0, icon_kinds: 0 }]
                : null;
        const answer = () => {
          state.sent.push(name);
          return later().then(() => ({ data, error: null }));
        };
        return {
          abortSignal: answer,
          then: (resolve: (value: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            answer().then(resolve, reject),
        };
      },
    };
  },
}));

const { resetBadgesForTest, useBadgeCounts, useBadgeRealtime } = await import('@/lib/badges');
const { usePostLikes } = await import('@/lib/chat/likes');
const { useReactions } = await import('@/lib/chat/reactions');
const { useRealtimeRows } = await import('@/lib/chat/realtime');
const { useThreadMessages } = await import('@/lib/chat/threads');
const { resetTopicReadMarks } = await import('@/lib/chat/topic-read-mark');
const { useTopicPosts, useTopicRealtime } = await import('@/lib/chat/topics');
const { usePostViews } = await import('@/lib/chat/views');

function row(n: number) {
  return {
    id: `row-${String(n).padStart(4, '0')}`,
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(),
    thread_id: 'thread',
    topic_id: 'topic',
    body: `Message ${n}`,
    author_id: 'other',
    attachments: [],
  };
}

// The tab bar's badges, as the app shell has them.
function useTabBar() {
  useBadgeCounts();
  useBadgeRealtime();
}

// As thread-page.tsx wires a conversation.
function useConversation() {
  useTabBar();
  const messages = useThreadMessages('thread');
  useReactions(
    'message',
    messages.messages.map((m) => m.id),
    'me',
    { within: 'thread' },
  );
  useRealtimeRows({
    table: 'chat_messages',
    filter: 'thread_id=eq.thread',
    onChange: messages.reload,
    onRow: messages.changed,
  });
  return messages;
}

// As topic-page.tsx wires a topic.
function useTopic() {
  useTabBar();
  const topic = useTopicPosts('room', 'topic');
  const ids = useMemo(() => topic.posts.map((p) => p.id), [topic.posts]);
  useReactions('post', ids, 'me', { within: 'topic' });
  const likes = usePostLikes(ids);
  usePostViews(ids, { afterVisit: true });
  useTopicRealtime('topic', topic, { reload: () => undefined }, likes);
  return topic;
}

// In small steps, so React draws between answers as a browser would.
async function wait(ms: number) {
  for (let left = ms; left > 0; left -= 20) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(20, left));
    });
  }
}

async function hiddenWhile(arrive: () => void) {
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await wait(1000);
  arrive();
  await vi.advanceTimersByTimeAsync(130_000);
  state.sent = [];
  visibility.mockReturnValue('visible');
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await wait(30_000);
  visibility.mockRestore();
}

function tally() {
  const counts: Record<string, number> = {};
  for (const name of state.sent) counts[name] = (counts[name] ?? 0) + 1;
  return counts;
}

beforeEach(() => {
  vi.useFakeTimers();
  resetBadgesForTest();
  resetTopicReadMarks();
  state.sent = [];
  const rows = Array.from({ length: 5 }, (_, n) => row(n));
  state.tables = {
    chat_messages: [...rows],
    chat_posts: [...rows],
    chat_topic_reads: [],
    chat_message_reactions: [],
    chat_post_reactions: [],
    chat_post_likes: [],
  };
});
afterEach(() => {
  vi.useRealTimers();
});

describe('back to a hidden conversation', () => {
  it('reads it once, marks it once, and counts the badges once, after the mark', async () => {
    const { result } = renderHook(useConversation);
    await wait(10_000);
    expect(result.current.messages).toHaveLength(5);
    await hiddenWhile(() => {
      for (let n = 5; n < 26; n += 1) state.tables.chat_messages?.push(row(n));
    });
    expect(result.current.messages).toHaveLength(26);
    expect(tally()).toEqual({
      chat_my_threads: 1,
      chat_messages: 1,
      chat_mark_thread_read_through: 1,
      chat_message_reactions: 1,
      my_badge_counts: 1,
    });
    // After the mark, not before it.
    expect(state.sent.indexOf('my_badge_counts')).toBeGreaterThan(
      state.sent.indexOf('chat_mark_thread_read_through'),
    );
  });

  it('with nothing new, catches up once and counts once, with no mark', async () => {
    renderHook(useConversation);
    await wait(10_000);
    await hiddenWhile(() => undefined);
    expect(tally()).toEqual({
      chat_my_threads: 1,
      chat_messages: 1,
      chat_message_reactions: 1,
      my_badge_counts: 1,
    });
  });
});

describe('back to a hidden topic', () => {
  it('reads it once, marks it once, and each count once, after the mark', async () => {
    const { result } = renderHook(useTopic);
    await wait(10_000);
    expect(result.current.posts).toHaveLength(5);
    await hiddenWhile(() => {
      for (let n = 5; n < 8; n += 1) state.tables.chat_posts?.push(row(n));
    });
    expect(result.current.posts).toHaveLength(8);
    expect(tally()).toEqual({
      chat_topic_for: 1,
      chat_posts: 1,
      chat_topic_reads: 1,
      chat_topic_viewed_by_me: 1,
      chat_mark_topic_read_through: 1,
      chat_post_reactions: 1,
      chat_post_likes: 1,
      chat_post_view_counts: 1,
      my_badge_counts: 1,
    });
    const mark = state.sent.indexOf('chat_mark_topic_read_through');
    expect(state.sent.indexOf('my_badge_counts')).toBeGreaterThan(mark);
    expect(state.sent.indexOf('chat_post_view_counts')).toBeGreaterThan(mark);
  });

  it('with nothing new, catches up its reactions and likes once, with no mark', async () => {
    renderHook(useTopic);
    await wait(10_000);
    await hiddenWhile(() => undefined);
    expect(tally()).toEqual({
      chat_topic_for: 1,
      chat_posts: 1,
      chat_topic_reads: 1,
      chat_topic_viewed_by_me: 1,
      chat_post_reactions: 1,
      chat_post_likes: 1,
      my_badge_counts: 1,
    });
  });
});
