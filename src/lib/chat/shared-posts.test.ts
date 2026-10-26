import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedPostPath, sharePost, useSharedPosts } from '@/lib/chat/shared-posts';

const db = vi.hoisted(() => ({
  rpcs: [] as { name: string; args: Record<string, unknown> }[],
  inserts: [] as Record<string, unknown>[],
  cards: [] as Record<string, unknown>[],
  rpcError: null as { message: string; code: string } | null,
  insertError: null as { message: string; code: string } | null,
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      db.rpcs.push({ name, args });
      const result =
        name === 'chat_open_direct'
          ? { data: 'dm-new', error: null }
          : { data: db.rpcError ? null : db.cards, error: db.rpcError };
      return Object.assign(Promise.resolve(result), {
        abortSignal: () => Promise.resolve(result),
      });
    },
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        db.inserts.push(row);
        return {
          select: () => ({
            single: () =>
              Promise.resolve(
                db.insertError
                  ? { data: null, error: db.insertError }
                  : {
                      data: {
                        id: 'm1',
                        thread_id: row.thread_id,
                        author_id: row.author_id,
                        body: row.body,
                        attachments: [],
                        created_at: '2026-10-25T10:00:00Z',
                        removed_at: null,
                        removed_by_admin: false,
                        edited_at: null,
                        reply_to: null,
                        notice: null,
                        link_preview: null,
                        shared_post_id: row.shared_post_id ?? null,
                      },
                      error: null,
                    },
              ),
          }),
        };
      },
    }),
  }),
}));

beforeEach(() => {
  db.rpcs = [];
  db.inserts = [];
  db.cards = [];
  db.rpcError = null;
  db.insertError = null;
});

describe('sharing a post', () => {
  it('sends it into a conversation the member is in, with the line trimmed', async () => {
    const result = await sharePost('p1', { threadId: 'grp' }, 'me', '  Look  ');
    expect(result).toEqual({ ok: true, threadId: 'grp' });
    expect(db.rpcs).toEqual([]);
    expect(db.inserts).toEqual([
      { thread_id: 'grp', author_id: 'me', body: 'Look', attachments: [], shared_post_id: 'p1' },
    ]);
  });

  it('opens the direct conversation first when given a member', async () => {
    const result = await sharePost('p1', { memberId: 'sam' }, 'me', '');
    expect(db.rpcs).toEqual([{ name: 'chat_open_direct', args: { other: 'sam' } }]);
    expect(db.inserts[0]).toMatchObject({ thread_id: 'dm-new', body: '', shared_post_id: 'p1' });
    expect(result).toEqual({ ok: true, threadId: 'dm-new' });
  });

  it('passes on the database’s own sentence', async () => {
    db.insertError = { message: "That post can't be shared.", code: '42501' };
    expect(await sharePost('p1', { threadId: 'grp' }, 'me', '')).toEqual({
      ok: false,
      error: "That post can't be shared.",
    });
  });
});

describe('the cards', () => {
  it('maps each by message, and a message with no card is answered as unavailable', async () => {
    db.cards = [
      {
        message_id: 'm1',
        post_id: 'p1',
        topic_id: 't1',
        room_id: 'kit',
        room_name: 'Kit',
        topic_title: 'Which cushion?',
        opening: false,
        author_id: 'ada',
        body: 'Air cells',
        photo_path: null,
        created_at: '2026-10-24T10:00:00Z',
      },
    ];
    const { result } = renderHook(() => useSharedPosts(['m2', 'm1', 'm1']));
    await waitFor(() => {
      expect(result.current.answered.size).toBe(2);
    });
    expect(db.rpcs).toEqual([{ name: 'chat_shared_posts', args: { message_ids: ['m1', 'm2'] } }]);
    const card = result.current.cards.get('m1');
    expect(card?.topicTitle).toBe('Which cushion?');
    expect(card && sharedPostPath(card)).toBe('/chat/rooms/kit/topics/t1?post=p1');
    expect(result.current.cards.has('m2')).toBe(false);
    expect(result.current.answered.has('m2')).toBe(true);
  });

  it('reads again when the conversation reloads, for the same messages', async () => {
    const { rerender } = renderHook(({ again }) => useSharedPosts(['m1'], again), {
      initialProps: { again: 1 },
    });
    await waitFor(() => {
      expect(db.rpcs).toHaveLength(1);
    });
    rerender({ again: 2 });
    await waitFor(() => {
      expect(db.rpcs).toHaveLength(2);
    });
  });

  it('does not call a failed read unavailable', async () => {
    db.rpcError = { message: 'offline', code: 'PGRST000' };
    const { result } = renderHook(() => useSharedPosts(['m1']));
    await waitFor(() => {
      expect(db.rpcs).toHaveLength(1);
    });
    expect(result.current.answered.size).toBe(0);
  });

  it('asks nothing when there are no shares', () => {
    renderHook(() => useSharedPosts([]));
    expect(db.rpcs).toEqual([]);
  });
});
