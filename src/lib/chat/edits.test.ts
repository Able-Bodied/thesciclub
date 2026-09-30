import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { groupEdits, useEdits } from '@/lib/chat/edits';
import type { ChatEdit } from '@/lib/chat/types';

/**
 * Only `@/lib/supabase` and the account are stubbed — the hook and
 * `groupEdits` are the real ones. The test that matters is the first: a
 * member's screen never asks for chat_edits at all.
 */

const db = vi.hoisted(() => ({
  isAdmin: false,
  rows: [] as Record<string, unknown>[],
  error: null as { code?: string; message: string } | null,
  /** Every read: the filter used and the ids in it. */
  reads: [] as [string, string[]][],
}));

vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'me', isAdmin: db.isAdmin }),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => {
        const finish = () => ({
          order: () => ({
            abortSignal: () => Promise.resolve({ data: db.rows, error: db.error }),
          }),
        });
        return {
          in: (column: string, ids: string[]) => {
            db.reads.push([column, ids]);
            return finish();
          },
          or: (filter: string) => {
            db.reads.push(['or', [filter]]);
            return finish();
          },
        };
      },
    }),
  }),
}));

const edit = (o: Partial<ChatEdit> & { id: string }): ChatEdit => ({
  postId: 'p1',
  messageId: null,
  body: 'Before.',
  attachments: [],
  editedBy: 'me',
  replacedAt: '2026-09-29T10:00:00Z',
  ...o,
});

beforeEach(() => {
  db.isAdmin = false;
  db.rows = [];
  db.error = null;
  db.reads = [];
});

describe('useEdits', () => {
  // THE test. chat_edits is for administrators; a member's read would come
  // back empty, and this hook does not even make it.
  it('asks nothing for a member, and answers with nothing', async () => {
    const { result } = renderHook(() => useEdits(['p1'], ['m1']));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(db.reads).toEqual([]);
    expect(result.current.byPost.size).toBe(0);
    expect(result.current.byMessage.size).toBe(0);
  });

  it('asks nothing when there is nothing to ask about', async () => {
    db.isAdmin = true;
    const { result } = renderHook(() => useEdits([], []));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(db.reads).toEqual([]);
  });

  it('reads the versions of the posts named, grouped by post, for an administrator', async () => {
    db.isAdmin = true;
    db.rows = [
      {
        id: 'e1',
        post_id: 'p1',
        message_id: null,
        body: 'First draft.',
        attachments: null,
        edited_by: 'me',
        replaced_at: '2026-09-29T10:00:00Z',
      },
      {
        id: 'e2',
        post_id: 'p1',
        message_id: null,
        body: 'Second draft.',
        attachments: ['rooms/bowel/a.webp'],
        edited_by: 'me',
        replaced_at: '2026-09-29T11:00:00Z',
      },
    ];
    const { result } = renderHook(() => useEdits(['p1', 'p2'], []));
    await waitFor(() => {
      expect(result.current.byPost.size).toBe(1);
    });
    expect(db.reads).toEqual([['post_id', ['p1', 'p2']]]);
    expect(result.current.byPost.get('p1')?.map((e) => e.body)).toEqual([
      'First draft.',
      'Second draft.',
    ]);
    expect(result.current.byPost.get('p1')?.[1]?.attachments).toEqual(['rooms/bowel/a.webp']);
  });

  it('asks for posts and messages in one read when it has both', async () => {
    db.isAdmin = true;
    const { result } = renderHook(() => useEdits(['p1'], ['m1']));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(db.reads).toEqual([['or', ['post_id.in.(p1),message_id.in.(m1)']]]);
  });

  it('reports a refusal as a sentence, with nothing shown', async () => {
    db.isAdmin = true;
    db.error = { code: '42501', message: 'permission denied for table chat_edits' };
    const { result } = renderHook(() => useEdits(['p1'], []));
    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    expect(result.current.byPost.size).toBe(0);
  });
});

describe('groupEdits', () => {
  it('groups by post and by message, keeping the order it was given', () => {
    const grouped = groupEdits([
      edit({ id: 'a', postId: 'p1' }),
      edit({ id: 'b', postId: null, messageId: 'm1' }),
      edit({ id: 'c', postId: 'p1' }),
    ]);
    expect(grouped.byPost.get('p1')?.map((e) => e.id)).toEqual(['a', 'c']);
    expect(grouped.byMessage.get('m1')?.map((e) => e.id)).toEqual(['b']);
  });
});
