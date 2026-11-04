import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readTopicPages, TOPIC_PAGE, type TopicCursor, useRoomTopics } from '@/lib/chat/topics';

interface Row {
  id: string;
  room_id: string;
  title: string;
  author_id: string | null;
  created_at: string;
  last_post_at: string;
  reply_count: number;
  view_count: number;
  unread: boolean;
  participant_ids: string[];
}

// Newest activity first, id breaking a tie, with runs of ties (the SQL order).
function roomOf(count: number): Row[] {
  const rows = Array.from({ length: count }, (_, n) => ({
    id: `t-${String(n).padStart(4, '0')}`,
    room_id: 'room',
    title: `Topic ${n}`,
    author_id: 'a',
    created_at: '2026-11-01T00:00:00.000001+00:00',
    last_post_at: `2026-11-01T${String(Math.floor(n / 3) % 24).padStart(2, '0')}:00:00.123456+00:00`,
    reply_count: 0,
    view_count: 0,
    unread: false,
    participant_ids: [],
  }));
  return rows.sort(
    (a, b) => b.last_post_at.localeCompare(a.last_post_at) || b.id.localeCompare(a.id),
  );
}

// chat_topics_page over a list, as the function pages it.
function pageOf(rows: Row[], size: number, before: TopicCursor | null): Row[] {
  const after = before
    ? rows.filter(
        (row) =>
          row.last_post_at < before.at || (row.last_post_at === before.at && row.id < before.id),
      )
    : rows;
  return after.slice(0, Math.min(Math.max(size, 1), 200));
}

describe('readTopicPages', () => {
  it.each([
    [0, 40],
    [1, 40],
    [39, 40],
    [40, 40],
    [41, 40],
    [95, 40],
    [95, 80],
    [95, 120],
    [450, 400],
    [450, 450],
  ])('of %i topics, the first %i: no gaps, no repeats, more told right', async (count, want) => {
    const rows = roomOf(count);
    const sizes: number[] = [];
    const read = await readTopicPages((size, before) => {
      sizes.push(size);
      return Promise.resolve({ data: pageOf(rows, size, before), error: null });
    }, want);
    expect(read.error).toBeNull();
    expect(read.rows).toEqual(rows.slice(0, want));
    expect(read.more).toBe(count > want);
    // One more than wanted, never past the function's 200.
    expect(sizes.every((size) => size <= 200)).toBe(true);
    expect(sizes.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(want + 1 + 200);
  });

  it('asks for 41 to show 40', async () => {
    const page = vi.fn((size: number, before: TopicCursor | null) =>
      Promise.resolve({ data: pageOf(roomOf(95), size, before), error: null }),
    );
    await readTopicPages(page, TOPIC_PAGE);
    expect(page).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledWith(41, null);
  });

  it('hands back the cursor exactly as the row sent it', async () => {
    const rows = roomOf(450);
    const page = vi.fn((size: number, before: TopicCursor | null) =>
      Promise.resolve({ data: pageOf(rows, size, before), error: null }),
    );
    await readTopicPages(page, 300);
    const first = rows[199];
    expect(page).toHaveBeenNthCalledWith(2, 101, { at: first?.last_post_at, id: first?.id });
  });

  it('a failed page is a failure, with no partial list', async () => {
    const rows = roomOf(450);
    let calls = 0;
    const read = await readTopicPages((size, before) => {
      calls += 1;
      return Promise.resolve(
        calls === 2
          ? { data: null, error: { message: 'boom' } }
          : { data: pageOf(rows, size, before), error: null },
      );
    }, 300);
    expect(read).toEqual({ rows: [], more: false, error: { message: 'boom' } });
  });
});

const db = vi.hoisted(() => ({
  rows: [] as unknown[],
  calls: [] as { name: string; args: Record<string, unknown> }[],
  missing: false,
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string, args: Record<string, unknown>) => ({
      abortSignal: () => {
        db.calls.push({ name, args });
        if (name === 'chat_topics_page' && db.missing) {
          return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'missing' } });
        }
        const rows = db.rows as Row[];
        const data =
          name === 'chat_topics_page'
            ? pageOf(
                rows,
                args.max_rows as number,
                args.before_at
                  ? { at: args.before_at as string, id: args.before_id as string }
                  : null,
              )
            : rows;
        return Promise.resolve({ data, error: null });
      },
    }),
  }),
}));

beforeEach(() => {
  db.rows = roomOf(95);
  db.calls = [];
  db.missing = false;
});

describe('useRoomTopics', () => {
  it('shows 40, then 80, then all 95, and a reload keeps what is shown', async () => {
    const { result } = renderHook(() => useRoomTopics('room'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.topics).toHaveLength(40);
    expect(result.current.hasMore).toBe(true);
    expect(db.calls).toEqual([
      {
        name: 'chat_topics_page',
        args: { room: 'room', max_rows: 41, before_at: null, before_id: null },
      },
    ]);

    act(() => {
      result.current.showMore();
    });
    await waitFor(() => {
      expect(result.current.topics).toHaveLength(80);
    });
    act(() => {
      result.current.showMore();
    });
    await waitFor(() => {
      expect(result.current.topics).toHaveLength(95);
    });
    expect(result.current.hasMore).toBe(false);
    expect(result.current.loadingMore).toBe(false);
    expect(new Set(result.current.topics.map((t) => t.id)).size).toBe(95);

    db.calls = [];
    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(db.calls).toHaveLength(1);
    });
    expect(db.calls[0]?.args.max_rows).toBe(121);
    expect(result.current.topics).toHaveLength(95);
  });

  it('reads the whole list from a database without paging', async () => {
    db.missing = true;
    const { result } = renderHook(() => useRoomTopics('room'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.topics).toHaveLength(95);
    expect(result.current.hasMore).toBe(false);
    expect(db.calls.map((c) => c.name)).toEqual(['chat_topics_page', 'chat_topics_for']);
  });
});
