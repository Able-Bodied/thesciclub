import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  groupLikes,
  likePost,
  likesLabel,
  unlikePost,
  usePostLikes,
  withLike,
} from '@/lib/chat/likes';
import { UPDATING_FAILURE } from '@/lib/describe-error';

/**
 * Only `@/lib/supabase` and the account are stubbed — the hook, the pure
 * functions and `describeError` are the real ones, so the sentences asserted
 * here are the sentences a member reads.
 *
 * The refusal fixture is the one the local stack returned on 2026-09-30 for a
 * member liking their own post (and, the same, a post that is not there): a
 * code and the database's wording, not wording alone — see HANDOFF.md on
 * fixtures without a code passing while the real thing did not.
 */

const REFUSED = {
  code: '42501',
  details: null,
  hint: null,
  message: 'new row violates row-level security policy for table "chat_post_likes"',
};

interface Row {
  post_id: string;
  member_id: string;
}

const db = vi.hoisted(() => ({
  rows: [] as Row[],
  readError: null as Record<string, unknown> | null,
  writeError: null as Record<string, unknown> | null,
  /** Every read: the ids asked for. */
  reads: [] as string[][],
  /** Every write, in order. */
  writes: [] as unknown[],
  /** When set, writes wait for this before answering. */
  hold: null as Promise<void> | null,
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'me', isAdmin: false }),
}));

vi.mock('@/lib/supabase', () => {
  const answer = async () => {
    if (db.hold) await db.hold;
    return { error: db.writeError };
  };
  return {
    getSupabase: () => ({
      from: (table: string) => ({
        select: (columns: string) => ({
          in: (column: string, ids: string[]) => {
            db.reads.push(ids);
            return {
              order: (by: string) => ({
                abortSignal: () => {
                  expect([table, columns, column, by]).toEqual([
                    'chat_post_likes',
                    'post_id, member_id',
                    'post_id',
                    'liked_at',
                  ]);
                  return Promise.resolve({ data: db.rows, error: db.readError });
                },
              }),
            };
          },
        }),
        upsert: (row: unknown, options: unknown) => {
          db.writes.push(['upsert', table, row, options]);
          return answer();
        },
        delete: () => ({
          eq: (a: string, x: string) => ({
            eq: (b: string, y: string) => {
              db.writes.push(['delete', table, { [a]: x, [b]: y }]);
              return answer();
            },
          }),
        }),
      }),
    }),
  };
});

beforeEach(() => {
  db.rows = [];
  db.readError = null;
  db.writeError = null;
  db.reads = [];
  db.writes = [];
  db.hold = null;
});

describe('groupLikes', () => {
  it('files member ids under their post, in the order read', () => {
    const byPost = groupLikes([
      { post_id: 'p1', member_id: 'jan' },
      { post_id: 'p2', member_id: 'sam' },
      { post_id: 'p1', member_id: 'me' },
    ]);
    expect([...byPost.entries()]).toEqual([
      ['p1', ['jan', 'me']],
      ['p2', ['sam']],
    ]);
  });

  it('never counts one member twice on one post', () => {
    const byPost = groupLikes([
      { post_id: 'p1', member_id: 'jan' },
      { post_id: 'p1', member_id: 'jan' },
    ]);
    expect(byPost.get('p1')).toEqual(['jan']);
  });
});

describe('withLike', () => {
  const start = new Map([['p1', ['jan']]]);

  it('adds a like at the end, where the read would put it', () => {
    expect(withLike(start, 'p1', 'me', true).get('p1')).toEqual(['jan', 'me']);
  });

  it('takes a like away, and drops a post nobody likes any more', () => {
    const next = withLike(start, 'p1', 'jan', false);
    expect(next.has('p1')).toBe(false);
  });

  it('is a new map and leaves the old one alone', () => {
    const next = withLike(start, 'p2', 'me', true);
    expect(next).not.toBe(start);
    expect(start.has('p2')).toBe(false);
    expect(next.get('p2')).toEqual(['me']);
  });

  it('liking twice is one like', () => {
    const once = withLike(start, 'p1', 'me', true);
    expect(withLike(once, 'p1', 'me', true).get('p1')).toEqual(['jan', 'me']);
  });
});

describe('likesLabel', () => {
  it('says one like and many likes', () => {
    expect(likesLabel(1)).toBe('1 like');
    expect(likesLabel(3)).toBe('3 likes');
  });
});

describe('likePost and unlikePost', () => {
  it('likes with on conflict do nothing, which needs no update grant', async () => {
    const result = await likePost('p1', 'me');
    expect(result).toEqual({ ok: true, value: null });
    expect(db.writes).toEqual([
      [
        'upsert',
        'chat_post_likes',
        { post_id: 'p1', member_id: 'me' },
        { onConflict: 'post_id,member_id', ignoreDuplicates: true },
      ],
    ]);
  });

  it('says a refused like in the plan’s sentences', async () => {
    db.writeError = REFUSED;
    const result = await likePost('p1', 'me');
    expect(result).toEqual({ ok: false, error: 'Your like was not saved. You cannot like this.' });
  });

  it('says the club is being updated when the table is not there yet', async () => {
    // What the hosted project answers before 20260930010000 is pushed.
    db.writeError = {
      code: 'PGRST205',
      details: null,
      hint: null,
      message: "Could not find the table 'public.chat_post_likes' in the schema cache",
    };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await likePost('p1', 'me');
    expect(result).toEqual({ ok: false, error: UPDATING_FAILURE });
  });

  it('takes a like back by deleting the reader’s own row', async () => {
    const result = await unlikePost('p1', 'me');
    expect(result).toEqual({ ok: true, value: null });
    expect(db.writes).toEqual([['delete', 'chat_post_likes', { post_id: 'p1', member_id: 'me' }]]);
  });
});

describe('usePostLikes', () => {
  it('asks nothing when there are no posts', async () => {
    const { result } = renderHook(() => usePostLikes([]));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(db.reads).toEqual([]);
    expect(result.current.byPost.size).toBe(0);
  });

  it('reads every post on screen in one read, and the same ids do not ask again', async () => {
    db.rows = [
      { post_id: 'p2', member_id: 'jan' },
      { post_id: 'p2', member_id: 'sam' },
    ];
    const { result, rerender } = renderHook(({ ids }) => usePostLikes(ids), {
      initialProps: { ids: ['p2', 'p1'] },
    });
    await waitFor(() => {
      expect(result.current.byPost.get('p2')).toEqual(['jan', 'sam']);
    });
    rerender({ ids: ['p1', 'p2'] });
    expect(db.reads).toEqual([['p1', 'p2']]);
  });

  it('draws no likes, rather than wrong ones, when the read fails', async () => {
    db.readError = { code: '', message: 'TypeError: Failed to fetch' };
    const { result } = renderHook(() => usePostLikes(['p1']));
    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    expect(result.current.byPost.size).toBe(0);
  });

  it('likes on screen before the write lands, and keeps it when it lands', async () => {
    db.rows = [{ post_id: 'p1', member_id: 'jan' }];
    let release: () => void = () => undefined;
    db.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { result } = renderHook(() => usePostLikes(['p1']));
    await waitFor(() => {
      expect(result.current.byPost.get('p1')).toEqual(['jan']);
    });

    act(() => {
      result.current.toggle('p1');
    });
    expect(result.current.byPost.get('p1')).toEqual(['jan', 'me']);

    await act(async () => {
      release();
      await db.hold;
    });
    expect(result.current.byPost.get('p1')).toEqual(['jan', 'me']);
    expect(result.current.failure).toBeNull();
  });

  it('puts a refused like back and says why, under that post', async () => {
    db.rows = [{ post_id: 'p1', member_id: 'jan' }];
    db.writeError = REFUSED;
    const { result } = renderHook(() => usePostLikes(['p1']));
    await waitFor(() => {
      expect(result.current.byPost.get('p1')).toEqual(['jan']);
    });

    act(() => {
      result.current.toggle('p1');
    });
    await waitFor(() => {
      expect(result.current.failure).not.toBeNull();
    });
    expect(result.current.byPost.get('p1')).toEqual(['jan']);
    expect(result.current.failure).toEqual({
      postId: 'p1',
      message: 'Your like was not saved. You cannot like this.',
    });
  });

  it('takes the reader’s own like back, and puts it back if that fails', async () => {
    db.rows = [{ post_id: 'p1', member_id: 'me' }];
    db.writeError = { code: '', message: 'TypeError: Failed to fetch' };
    const { result } = renderHook(() => usePostLikes(['p1']));
    await waitFor(() => {
      expect(result.current.byPost.get('p1')).toEqual(['me']);
    });

    act(() => {
      result.current.toggle('p1');
    });
    await waitFor(() => {
      expect(result.current.failure).not.toBeNull();
    });
    expect(db.writes[0]).toEqual(['delete', 'chat_post_likes', { post_id: 'p1', member_id: 'me' }]);
    expect(result.current.byPost.get('p1')).toEqual(['me']);
  });

  it('ignores a second tap on a post while its first write is in flight', async () => {
    let release: () => void = () => undefined;
    db.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { result } = renderHook(() => usePostLikes(['p1']));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.toggle('p1');
    });
    act(() => {
      result.current.toggle('p1');
    });
    expect(db.writes).toHaveLength(1);
    expect(result.current.byPost.get('p1')).toEqual(['me']);

    await act(async () => {
      release();
      await db.hold;
    });
    // Free again once it has landed.
    act(() => {
      result.current.toggle('p1');
    });
    expect(db.writes).toHaveLength(2);
    expect(db.writes[1]).toEqual(['delete', 'chat_post_likes', { post_id: 'p1', member_id: 'me' }]);
  });

  it('reads again on reload', async () => {
    const { result } = renderHook(() => usePostLikes(['p1']));
    await waitFor(() => {
      expect(db.reads).toHaveLength(1);
    });
    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(db.reads).toHaveLength(2);
    });
  });
});
