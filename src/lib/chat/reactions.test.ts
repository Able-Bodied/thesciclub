import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type ReactionRow, useReactions } from '@/lib/chat/reactions';

const db = vi.hoisted(() => ({
  rows: [] as ReactionRow[],
  readError: null as null | { code: string; message: string },
  writeError: null as null | { code: string; message: string },
  thrown: false,
  reads: [] as unknown[],
  writes: [] as unknown[],
  hold: null as Promise<void> | null,
  pages: [] as number[],
  changed: null as (() => void) | null,
}));
vi.mock('@/lib/chat/realtime', () => ({
  useRealtimeRows: ({ onChange }: { onChange: () => void }) => {
    db.changed = onChange;
  },
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: (table: string) => {
      let ids: string[] = [];
      let offset = 0;
      const query = {
        select: () => query,
        in: (_: string, values: string[]) => {
          ids = values;
          return query;
        },
        order: () => query,
        range: (from: number) => {
          offset = from;
          db.pages.push(from);
          return query;
        },
        abortSignal: () => {
          db.reads.push({ table, ids });
          if (db.thrown) return Promise.reject(new TypeError('Failed to fetch'));
          return Promise.resolve({
            data: db.rows.filter((r) => ids.includes(r.target_id)).slice(offset, offset + 1000),
            error: db.readError,
          });
        },
      };
      return query;
    },
    rpc: async (name: string, args: { kind: string; target: string; reaction: string | null }) => {
      db.writes.push({ name, ...args });
      if (db.hold) await db.hold;
      if (db.thrown) throw new TypeError('Failed to fetch');
      if (!db.writeError)
        db.rows = [
          ...db.rows.filter((r) => r.target_id !== args.target || r.member_id !== 'me'),
          { target_id: args.target, member_id: 'me', emoji: args.reaction as ReactionRow['emoji'] },
        ];
      return { error: db.writeError };
    },
  }),
}));
beforeEach(() => {
  db.rows = [];
  db.readError = null;
  db.writeError = null;
  db.thrown = false;
  db.reads = [];
  db.writes = [];
  db.hold = null;
  db.pages = [];
});
const loaded = async (result: { current: { loading: boolean } }) =>
  waitFor(() => {
    expect(result.current.loading).toBe(false);
  });

describe('emoji reactions', () => {
  it('reads everybody’s reactions only for the targets on screen', async () => {
    db.rows = [
      { target_id: 'p1', member_id: 'other', emoji: '❤️' },
      { target_id: 'hidden', member_id: 'other', emoji: '😂' },
    ];
    const { result } = renderHook(() => useReactions('post', ['p1', 'p1'], 'me'));
    await loaded(result);
    expect(result.current.rows).toEqual([db.rows[0]]);
    expect(db.reads).toEqual([{ table: 'chat_post_reactions', ids: ['p1'] }]);
  });
  it('reads beyond Supabase’s row limit', async () => {
    db.rows = Array.from({ length: 1002 }, (_, i) => ({
      target_id: 'p1',
      member_id: String(i),
      emoji: '👍',
    }));
    const { result } = renderHook(() => useReactions('post', ['p1'], 'me'));
    await loaded(result);
    expect(result.current.rows).toHaveLength(1002);
    expect(db.pages).toEqual([0, 1000]);
  });
  it('saves, changes and removes one reaction using the authenticated RPC', async () => {
    const { result } = renderHook(() => useReactions('message', ['m1'], 'me'));
    await loaded(result);
    for (const emoji of ['❤️', '💪', null] as const) {
      await act(async () => {
        expect(await result.current.choose('m1', emoji)).toBe(true);
      });
      await loaded(result);
      expect(result.current.rows).toEqual([{ target_id: 'm1', member_id: 'me', emoji }]);
    }
    expect(db.writes).toEqual(
      ['❤️', '💪', null].map((reaction) => ({
        name: 'chat_set_reaction',
        kind: 'message',
        target: 'm1',
        reaction,
      })),
    );
  });
  it('ignores repeat taps while a write is pending', async () => {
    let release: () => void = () => undefined;
    db.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { result } = renderHook(() => useReactions('post', ['p1'], 'me'));
    await loaded(result);
    let first: Promise<boolean> | undefined;
    act(() => {
      first = result.current.choose('p1', '👍');
    });
    expect(result.current.pending.has('p1')).toBe(true);
    await act(async () => {
      expect(await result.current.choose('p1', '❤️')).toBe(false);
    });
    expect(db.writes).toHaveLength(1);
    await act(async () => {
      release();
      await first;
    });
  });
  it('keeps the old count when a write is refused', async () => {
    db.rows = [{ target_id: 'p1', member_id: 'me', emoji: '👍' }];
    db.writeError = { code: '42501', message: 'You cannot react.' };
    const { result } = renderHook(() => useReactions('post', ['p1'], 'me'));
    await loaded(result);
    await act(async () => {
      expect(await result.current.choose('p1', '❤️')).toBe(false);
    });
    expect(result.current.rows[0]?.emoji).toBe('👍');
    expect(result.current.failure?.target).toBe('p1');
    expect(result.current.pending.size).toBe(0);
  });
  it('reports network failures and releases the pending control', async () => {
    const { result } = renderHook(() => useReactions('post', ['p1'], 'me'));
    await loaded(result);
    db.thrown = true;
    await act(async () => {
      expect(await result.current.choose('p1', '❤️')).toBe(false);
    });
    expect(result.current.failure?.message).toBeTruthy();
    expect(result.current.pending.size).toBe(0);
  });
  it('refetches another member’s reaction on a live update', async () => {
    const { result } = renderHook(() => useReactions('post', ['p1'], 'me'));
    await loaded(result);
    db.rows = [{ target_id: 'p1', member_id: 'other', emoji: '🎉' }];
    act(() => db.changed?.());
    await waitFor(() => {
      expect(result.current.rows).toEqual(db.rows);
    });
  });
  it('never carries private rows into another conversation', async () => {
    db.rows = [{ target_id: 'm1', member_id: 'other', emoji: '❤️' }];
    const { result, rerender } = renderHook(({ id }) => useReactions('message', [id], 'me'), {
      initialProps: { id: 'm1' },
    });
    await loaded(result);
    rerender({ id: 'm2' });
    expect(result.current.rows).toEqual([]);
    await loaded(result);
    expect(result.current.rows).toEqual([]);
  });
  it('shows a read error rather than invented counts and retries', async () => {
    db.readError = { code: '42501', message: 'denied' };
    const { result } = renderHook(() => useReactions('post', ['p1'], 'me'));
    await loaded(result);
    expect(result.current.error).toBeTruthy();
    db.readError = null;
    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });
  });
  it('does not read or write without a member or a visible target', async () => {
    const { result } = renderHook(() => useReactions('post', [], null));
    await act(async () => {
      expect(await result.current.choose('p1', '👍')).toBe(false);
    });
    expect(db.reads).toEqual([]);
    expect(db.writes).toEqual([]);
  });
});
