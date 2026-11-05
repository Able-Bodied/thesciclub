import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readReceipt, useThreadReadReceipts } from '@/lib/chat/read-receipts';
import type { ChatMessage } from '@/lib/chat/types';
import { pagedDatabase } from '@/test/paged-database';

const db = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  onChange: null as (() => void) | null,
  onRow: null as ((row: Record<string, unknown>) => void) | null,
  watch: vi.fn(),
  reads: 0,
}));
vi.mock('@/lib/chat/realtime', () => ({
  useRealtimeRows: (options: {
    table: string;
    filter: string;
    onChange: () => void;
    onRow?: (row: Record<string, unknown>) => void;
  }) => {
    db.watch(options.table, options.filter);
    db.onChange = options.onChange;
    db.onRow = options.onRow ?? null;
  },
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => {
    const base = pagedDatabase({ chat_thread_members: db.rows });
    return {
      ...base,
      from: (table: string) => {
        db.reads += 1;
        return base.from(table);
      },
    };
  },
}));

const message: ChatMessage = {
  id: 'message',
  threadId: 'thread',
  authorId: 'me',
  body: 'Hello',
  attachments: [],
  createdAt: '2026-10-08T12:00:00.123456Z',
  removedAt: null,
  removedByAdmin: false,
  editedAt: null,
  replyTo: null,
  notice: null,
  linkPreview: null,
  sharedPostId: null,
};

beforeEach(() => {
  db.rows = [{ thread_id: 'thread', member_id: 'other', last_read_at: '-infinity' }];
  db.onChange = null;
  db.onRow = null;
  db.reads = 0;
  db.watch.mockClear();
});

describe('message receipts', () => {
  it('does not count the sender opening their own conversation', () => {
    expect(readReceipt(message, 'direct', new Map([['me', '2026-10-08T13:00:00Z']]))).toBeNull();
  });
  it('requires the other member to have reached this message, preserving microseconds', () => {
    expect(
      readReceipt(message, 'direct', new Map([['other', '2026-10-08T12:00:00.123455+00:00']])),
    ).toBeNull();
    expect(
      readReceipt(message, 'direct', new Map([['other', '2026-10-08T12:00:00.123456+00:00']])),
    ).toBe('Read');
  });
  it('counts the current group recipients, excluding the sender and unread members', () => {
    expect(
      readReceipt(
        message,
        'group',
        new Map([
          ['me', '2026-10-08T13:00:00Z'],
          ['one', '2026-10-08T13:00:00Z'],
          ['two', '-infinity'],
        ]),
      ),
    ).toBe('Read by 1 of 2');
  });
  it.each([
    { pending: true },
    { removedAt: '2026-10-08T13:00:00Z' },
    { notice: 'renamed' as const },
  ])('does not label a pending/removed message or notice (%o)', (patch) => {
    expect(
      readReceipt({ ...message, ...patch }, 'direct', new Map([['other', '2026-10-08T13:00:00Z']])),
    ).toBeNull();
  });
  it('shows no receipt while the read is unavailable', () => {
    expect(readReceipt(message, 'direct', null)).toBeNull();
  });
});

describe('live receipt reads', () => {
  it('refetches receipts on a roster update without reloading or marking messages', async () => {
    const { result } = renderHook(() => useThreadReadReceipts('thread'));
    await waitFor(() => {
      expect(result.current?.get('other')).toBe('-infinity');
    });
    expect(db.watch).toHaveBeenCalledWith('chat_thread_members', 'thread_id=eq.thread');
    db.rows = [{ thread_id: 'thread', member_id: 'other', last_read_at: '2026-10-08T13:00:00Z' }];
    await act(async () => {
      db.onChange?.();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(readReceipt(message, 'direct', result.current)).toBe('Read');
    });
  });
  it('applies a read position from the change itself, without reading the roster', async () => {
    const { result } = renderHook(() => useThreadReadReceipts('thread'));
    await waitFor(() => {
      expect(result.current?.get('other')).toBe('-infinity');
    });
    const before = db.reads;
    act(() => {
      db.onRow?.({
        thread_id: 'thread',
        member_id: 'other',
        last_read_at: '2026-10-08T13:00:00+00:00',
      });
    });
    expect(readReceipt(message, 'direct', result.current)).toBe('Read');
    // An older position arriving late does not move it back.
    act(() => {
      db.onRow?.({
        thread_id: 'thread',
        member_id: 'other',
        last_read_at: '2026-10-08T11:00:00+00:00',
      });
    });
    expect(result.current?.get('other')).toBe('2026-10-08T13:00:00+00:00');
    // A new member of the group, as it came.
    act(() => {
      db.onRow?.({
        thread_id: 'thread',
        member_id: 'new',
        last_read_at: '2026-10-08T12:30:00+00:00',
      });
    });
    expect(readReceipt(message, 'group', result.current)).toBe('Read by 2 of 2');
    expect(db.reads).toBe(before);
  });

  it('reads the roster again when a change is not shaped as expected', async () => {
    const { result } = renderHook(() => useThreadReadReceipts('thread'));
    await waitFor(() => {
      expect(result.current?.get('other')).toBe('-infinity');
    });
    const before = db.reads;
    // No zone: it would be read as local time.
    act(() => {
      db.onRow?.({ thread_id: 'thread', member_id: 'other', last_read_at: '2026-10-08T13:00:00' });
    });
    await waitFor(() => {
      expect(db.reads).toBe(before + 1);
    });
    act(() => {
      db.onRow?.({
        thread_id: 'elsewhere',
        member_id: 'other',
        last_read_at: '2026-10-08T13:00:00Z',
      });
    });
    await waitFor(() => {
      expect(db.reads).toBe(before + 2);
    });
    expect(result.current?.get('other')).toBe('-infinity');
  });

  it('paginates large rosters and scopes the read to this thread', async () => {
    db.rows = Array.from({ length: 1005 }, (_, id) => ({
      thread_id: 'thread',
      member_id: `member-${id}`,
      last_read_at: '-infinity',
    }));
    db.rows.push({
      thread_id: 'elsewhere',
      member_id: 'outsider',
      last_read_at: '2026-10-08T13:00:00Z',
    });
    const { result } = renderHook(() => useThreadReadReceipts('thread'));
    await waitFor(() => {
      expect(result.current?.size).toBe(1005);
    });
    expect(result.current?.has('outsider')).toBe(false);
  });
});
