import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { announcePostViewsChanged, usePostViews } from '@/lib/chat/views';

const db = vi.hoisted(() => ({
  member: true,
  rows: [] as { post_id: string; view_count: number | string }[],
  error: null as { message: string } | null,
  calls: [] as string[][],
  hold: null as Promise<void> | null,
}));
vi.mock('@/lib/account', () => ({
  useAccount: () => (db.member ? { status: 'member', userId: 'me' } : { status: 'guest' }),
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (_name: string, args: { post_ids: string[] }) => ({
      abortSignal: async () => {
        db.calls.push(args.post_ids);
        const result = {
          data: db.rows.filter((row) => args.post_ids.includes(row.post_id)),
          error: db.error,
        };
        if (db.hold) await db.hold;
        return result;
      },
    }),
  }),
}));
beforeEach(() => {
  db.member = true;
  db.rows = [];
  db.error = null;
  db.calls = [];
  db.hold = null;
});

describe('post views', () => {
  it('loads counts beyond the database row cap', async () => {
    const ids = Array.from({ length: 1001 }, (_, n) => `post-${n}`);
    db.rows = ids.map((id) => ({ post_id: id, view_count: 1 }));
    const { result } = renderHook(() => usePostViews(ids));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(db.calls.map((ids) => ids.length)).toEqual([500, 500, 1]);
    expect(result.current.byPost.size).toBe(1001);
    expect(result.current.byPost.get('post-1000')).toBe(1);
  });
  it('reads each post once and keeps real zeroes as well as positive counts', async () => {
    db.rows = [
      { post_id: 'one', view_count: 0 },
      { post_id: 'two', view_count: '3' },
    ];
    const { result } = renderHook(() => usePostViews(['two', 'one', 'two']));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(db.calls).toEqual([['one', 'two']]);
    expect([...result.current.byPost]).toEqual([
      ['one', 0],
      ['two', 3],
    ]);
  });

  it('refreshes after the read marker is saved', async () => {
    db.rows = [{ post_id: 'one', view_count: 0 }];
    const { result } = renderHook(() => usePostViews(['one']));
    await waitFor(() => {
      expect(result.current.byPost.get('one')).toBe(0);
    });
    db.rows = [{ post_id: 'one', view_count: 1 }];
    act(() => {
      announcePostViewsChanged();
    });
    await waitFor(() => {
      expect(result.current.byPost.get('one')).toBe(1);
    });
    expect(db.calls).toHaveLength(2);
  });

  it('does not invent zero counts when the database refuses the read', async () => {
    db.error = { message: 'unavailable' };
    const { result } = renderHook(() => usePostViews(['one']));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.byPost.has('one')).toBe(false);
  });

  it('ignores a late response after the displayed posts change', async () => {
    let release: () => void = () => undefined;
    db.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    db.rows = [{ post_id: 'old', view_count: 8 }];
    const { result, rerender } = renderHook(({ id }) => usePostViews([id]), {
      initialProps: { id: 'old' },
    });
    db.hold = null;
    db.rows = [{ post_id: 'new', view_count: 2 }];
    rerender({ id: 'new' });
    await waitFor(() => {
      expect(result.current.byPost.get('new')).toBe(2);
    });
    await act(async () => {
      release();
      await Promise.resolve();
    });
    expect([...result.current.byPost]).toEqual([['new', 2]]);
  });

  it('does not query outside membership or with no posts', async () => {
    db.member = false;
    const { result } = renderHook(() => usePostViews(['one']));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    renderHook(() => usePostViews([]));
    expect(db.calls).toEqual([]);
  });
});
