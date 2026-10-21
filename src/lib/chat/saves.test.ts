import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  saveItem,
  saveKey,
  toSavedItem,
  unsaveItem,
  useSavedItems,
  useTopicSaves,
} from '@/lib/chat/saves';

// What the local stack answered on 2026-10-20 for a closed room's topic.
const REFUSED = {
  code: '42501',
  details: null,
  hint: null,
  message: 'new row violates row-level security policy for table "chat_saves"',
};

const db = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  readError: null as Record<string, unknown> | null,
  writeError: null as Record<string, unknown> | null,
  /** Each call made on the builder, in order, for every query. */
  calls: [] as [string, ...unknown[]][],
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'me', isAdmin: false }),
}));

vi.mock('@/lib/supabase', () => {
  // A builder that records each call and answers when awaited.
  function builder(answer: () => { data?: unknown; error: unknown }) {
    const chain: Record<string, unknown> = {};
    for (const name of ['select', 'eq', 'is', 'order', 'range', 'abortSignal', 'overrideTypes']) {
      chain[name] = (...args: unknown[]) => {
        db.calls.push([name, ...args]);
        return chain;
      };
    }
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(answer()).then(resolve);
    return chain;
  }
  return {
    getSupabase: () => ({
      from: (table: string) => {
        db.calls.push(['from', table]);
        const read = builder(() =>
          db.readError ? { data: null, error: db.readError } : { data: db.rows, error: null },
        );
        return {
          select: (columns: string) => {
            db.calls.push(['select', columns]);
            return read;
          },
          upsert: (row: unknown, options: unknown) => {
            db.calls.push(['upsert', row, options]);
            return builder(() => ({ error: db.writeError }));
          },
          delete: () => {
            db.calls.push(['delete']);
            return builder(() => ({ error: db.writeError }));
          },
        };
      },
    }),
  };
});

beforeEach(() => {
  db.rows = [];
  db.readError = null;
  db.writeError = null;
  db.calls = [];
});

describe('saveKey', () => {
  it('keeps a topic save apart from a save of a post in it', () => {
    expect(saveKey('t', null)).toBe('t');
    expect(saveKey('t', 'p')).toBe('t:p');
  });
});

describe('writing', () => {
  it('saves as an insert that ignores a duplicate, for the reader', async () => {
    expect(await saveItem('me', 't', null)).toEqual({ ok: true, value: null });
    expect(db.calls).toContainEqual([
      'upsert',
      { member_id: 'me', topic_id: 't', post_id: null },
      { onConflict: 'member_id,topic_id,post_id', ignoreDuplicates: true },
    ]);
  });

  it('says so when a save is refused', async () => {
    db.writeError = REFUSED;
    expect(await saveItem('me', 't', 'p')).toEqual({
      ok: false,
      error: 'This was not saved. You cannot save this.',
    });
  });

  it('takes back a topic save without touching the saves of its posts', async () => {
    await unsaveItem('me', 't', null);
    expect(db.calls).toContainEqual(['is', 'post_id', null]);
    expect(db.calls.some(([name, column]) => name === 'eq' && column === 'post_id')).toBe(false);
  });

  it('takes back a post save by its post', async () => {
    await unsaveItem('me', 't', 'p');
    expect(db.calls).toContainEqual(['eq', 'post_id', 'p']);
    expect(db.calls).toContainEqual(['eq', 'member_id', 'me']);
  });
});

describe('useTopicSaves', () => {
  it('reads the topic’s saves, then toggles one at once and keeps it', async () => {
    db.rows = [{ topic_id: 't', post_id: null }];
    const { result } = renderHook(() => useTopicSaves('t'));
    await waitFor(() => {
      expect(result.current.saved.has('t')).toBe(true);
    });
    expect(db.calls).toContainEqual(['eq', 'topic_id', 't']);
    act(() => {
      result.current.toggle('t', 'p');
    });
    expect(result.current.saved.has('t:p')).toBe(true);
    await waitFor(() => {
      expect(db.calls.some(([name]) => name === 'upsert')).toBe(true);
    });
    expect(result.current.failure).toBeNull();
  });

  it('puts a save back and says why when it fails', async () => {
    const { result } = renderHook(() => useTopicSaves('t'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    db.writeError = REFUSED;
    act(() => {
      result.current.toggle('t', null);
    });
    await waitFor(() => {
      expect(result.current.failure).toEqual({
        key: 't',
        message: 'This was not saved. You cannot save this.',
      });
    });
    expect(result.current.saved.has('t')).toBe(false);
  });
});

describe('the Saved list', () => {
  it('reads newest first, and marks what can no longer be read', async () => {
    db.rows = [
      {
        topic_id: 't',
        post_id: 'p',
        saved_at: '2026-10-20T10:00:00Z',
        topic: { title: 'Cushions', room_id: 'kit' },
        post: { body: 'Air cells', author_id: 'jan', removed_at: null },
      },
      { topic_id: 'u', post_id: null, saved_at: '2026-10-19T10:00:00Z', topic: null, post: null },
    ];
    const { result } = renderHook(() => useSavedItems());
    await waitFor(() => {
      expect(result.current.items).toHaveLength(2);
    });
    expect(db.calls).toContainEqual(['order', 'saved_at', { ascending: false }]);
    expect(result.current.items[0]).toEqual({
      topicId: 't',
      postId: 'p',
      savedAt: '2026-10-20T10:00:00Z',
      topic: { title: 'Cushions', roomId: 'kit' },
      post: { body: 'Air cells', authorId: 'jan', removed: false },
    });
    expect(result.current.items[1]?.topic).toBeNull();
  });

  it('puts an item back when taking it off fails', async () => {
    db.rows = [
      { topic_id: 't', post_id: null, saved_at: '2026-10-20T10:00:00Z', topic: null, post: null },
    ];
    const { result } = renderHook(() => useSavedItems());
    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });
    db.writeError = { code: '08000', details: null, hint: null, message: 'Failed to fetch' };
    const item = result.current.items[0];
    if (!item) throw new Error('no item');
    let message: string | null = null;
    await act(async () => {
      message = await result.current.remove(item);
    });
    expect(message).toMatch(/offline/);
    expect(result.current.items).toHaveLength(1);
  });
});

describe('toSavedItem', () => {
  it('reads a removed post as removed', () => {
    expect(
      toSavedItem({
        topic_id: 't',
        post_id: 'p',
        saved_at: 'x',
        topic: { title: 'T', room_id: 'r' },
        post: { body: '', author_id: null, removed_at: 'y' },
      }).post,
    ).toEqual({ body: '', authorId: null, removed: true });
  });
});
