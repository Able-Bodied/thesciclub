import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { HOME_TOPIC_LIMIT, useHomeTopics } from '@/lib/home/topics';

const db = vi.hoisted(() => ({
  calls: [] as unknown[][],
  includeHidden: false,
  includeClosed: false,
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: (table: string) => {
      const query = {
        select: (columns: string) => {
          db.calls.push(['select', columns]);
          return query;
        },
        eq: (column: string, value: unknown) => {
          db.calls.push(['eq', column, value]);
          if (column === 'chat_rooms.show_in_home' && value === true) db.includeHidden = false;
          return query;
        },
        not: (column: string, operator: string, value: unknown) => {
          db.calls.push(['not', column, operator, value]);
          if (column === 'chat_rooms.opened_at' && operator === 'is' && value === null)
            db.includeClosed = false;
          return query;
        },
        order: () => query,
        limit: (count: number) => {
          db.calls.push(['limit', count]);
          return query;
        },
        in: () => query,
        abortSignal: () =>
          Promise.resolve({
            data:
              table === 'chat_topics'
                ? [
                    {
                      id:
                        db.includeHidden || db.includeClosed
                          ? 'excluded-newest-topic'
                          : 'eligible-topic',
                      room_id: 'bowel',
                      title: 'Eligible topic',
                      author_id: null,
                      created_at: '2026-10-10T10:00:00Z',
                      last_post_at: '2026-10-10T10:00:00Z',
                      reply_count: 0,
                    },
                  ]
                : [],
            error: null,
          }),
      };
      return query;
    },
  }),
}));

beforeEach(() => {
  db.calls = [];
  db.includeHidden = true;
  db.includeClosed = true;
});

it('requests only eligible rooms before limiting Home topics, including for an admin', async () => {
  const { result } = renderHook(() => useHomeTopics());
  await waitFor(() => {
    expect(result.current.loading).toBe(false);
  });
  expect(result.current.error).toBeNull();
  expect(result.current.topics.map((t) => t.id)).toEqual(['eligible-topic']);
  expect(db.calls[0]?.[1]).toContain('chat_rooms!inner');
  expect(db.calls.slice(1, 4)).toEqual([
    ['eq', 'chat_rooms.show_in_home', true],
    ['not', 'chat_rooms.opened_at', 'is', null],
    ['limit', HOME_TOPIC_LIMIT],
  ]);
});
