import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useTopicOpeningPosts } from '@/lib/chat/opening-posts';

const db = vi.hoisted(() => ({
  rows: [] as { topic_id: string; post_id: string | null }[],
  ids: [] as string[][],
  error: null as { message: string } | null,
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (_name: string, args: { topic_ids: string[] }) => ({
      abortSignal: () => {
        db.ids.push(args.topic_ids);
        return Promise.resolve({ data: db.rows, error: db.error });
      },
    }),
  }),
}));
beforeEach(() => {
  db.rows = [];
  db.ids = [];
  db.error = null;
});

it('asks for only the displayed topics and keeps a removed opener null', async () => {
  db.rows = [
    { topic_id: 'one', post_id: 'post' },
    { topic_id: 'two', post_id: null },
  ];
  const { result } = renderHook(() => useTopicOpeningPosts(['two', 'one', 'two']));
  await waitFor(() => {
    expect(result.current.byTopic.size).toBe(2);
  });
  expect(db.ids).toEqual([['one', 'two']]);
  expect([...result.current.byTopic]).toEqual([
    ['one', 'post'],
    ['two', null],
  ]);
});
it('refreshes actions when a post is removed', async () => {
  db.rows = [{ topic_id: 'one', post_id: 'post' }];
  const { result } = renderHook(() => useTopicOpeningPosts(['one']));
  await waitFor(() => {
    expect(result.current.byTopic.get('one')).toBe('post');
  });
  db.rows = [{ topic_id: 'one', post_id: null }];
  act(() => {
    result.current.reload();
  });
  await waitFor(() => {
    expect(result.current.byTopic.get('one')).toBeNull();
  });
});
it('does not turn a failed read into a usable post id', async () => {
  db.rows = [{ topic_id: 'one', post_id: 'post' }];
  db.error = { message: 'unavailable' };
  const { result } = renderHook(() => useTopicOpeningPosts(['one']));
  await act(async () => {
    await Promise.resolve();
  });
  expect(db.ids).toEqual([['one']]);
  expect(result.current.byTopic.size).toBe(0);
});
