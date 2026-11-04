import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beforeFilter,
  dropMessage,
  type LoadedMessages,
  MESSAGE_PAGE,
  mergeEarlier,
  mergeNewest,
  upsertMessage,
  useThreadMessages,
} from '@/lib/chat/threads';
import type { ChatMessage } from '@/lib/chat/types';

type Row = Record<string, unknown> & { id: string; created_at: string };

/** A fake REST boundary that understands the reads a conversation makes. */
const db = vi.hoisted(() => ({
  rows: [] as Row[],
  /** Every chat_messages request sent, by what it filtered on. */
  requests: [] as string[],
  fail: false,
  threadFound: true,
  rpc: [] as string[],
}));

vi.mock('@/lib/account', () => ({ useAccount: () => ({ status: 'member', userId: 'me' }) }));
vi.mock('@/lib/chat/unread', () => ({ unreadChanged: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ announceNotificationsChanged: vi.fn() }));

/** Parses the one or() filter beforeFilter writes. */
function before(filter: string) {
  const match = /^created_at\.lt\."([^"]+)",and\(created_at\.eq\."[^"]+",id\.lt\.([^)]+)\)$/.exec(
    filter,
  );
  if (!match) throw new Error(`unexpected filter ${filter}`);
  const [, at = '', id = ''] = match;
  return (row: Row) => row.created_at < at || (row.created_at === at && row.id < id);
}

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string) => {
      db.rpc.push(name);
      const data =
        name === 'chat_my_threads' && db.threadFound
          ? [{ id: 't1', kind: 'group', member_count: 3 }]
          : null;
      const result = () =>
        db.fail
          ? { data: null, error: { message: 'timeout', code: '57014' } }
          : { data, error: null };
      return {
        abortSignal: () => Promise.resolve(result()),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result())),
      };
    },
    from: () => {
      const tests: ((row: Row) => boolean)[] = [];
      const described: string[] = [];
      const order: { column: string; ascending: boolean }[] = [];
      let first = 0;
      let last = 999;
      const run = () => {
        db.requests.push(described.join(' '));
        if (db.fail) return { data: null, error: { message: 'timeout', code: '57014' } };
        const rows = db.rows.filter((row) => tests.every((t) => t(row)));
        rows.sort((a, b) => {
          for (const { column, ascending } of order) {
            const x = String(a[column]);
            const y = String(b[column]);
            if (x !== y) return (x < y ? -1 : 1) * (ascending ? 1 : -1);
          }
          return 0;
        });
        return { data: rows.slice(first, last + 1), error: null };
      };
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          if (column === 'id') described.push(`id=${String(value)}`);
          tests.push((row) => row[column] === value);
          return query;
        },
        gte: (column: string, value: string) => {
          described.push(`from=${value}`);
          tests.push((row) => String(row[column]) >= value);
          return query;
        },
        or: (filter: string) => {
          described.push('before');
          tests.push(before(filter));
          return query;
        },
        order: (column: string, options?: { ascending?: boolean }) => {
          order.push({ column, ascending: options?.ascending ?? true });
          return query;
        },
        range: (start: number, end: number) => {
          first = start;
          last = end;
          return query;
        },
        abortSignal: () => query,
        maybeSingle: () => {
          const { data, error } = run();
          return Promise.resolve({ data: data?.[0] ?? null, error });
        },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(run())),
      };
      return query;
    },
  }),
}));

const at = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
const row = (n: number, o: Partial<Row> = {}): Row => ({
  id: `m${String(n).padStart(4, '0')}`,
  thread_id: 't1',
  author_id: 'jan',
  body: `Message ${n}`,
  attachments: [],
  created_at: at(n),
  removed_at: null,
  removed_by_admin: false,
  edited_at: null,
  reply_to: null,
  notice: null,
  link_preview: null,
  shared_post_id: null,
  ...o,
});

const message = (n: number, o: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `m${String(n).padStart(4, '0')}`,
  threadId: 't1',
  authorId: 'jan',
  body: `Message ${n}`,
  attachments: [],
  createdAt: at(n),
  removedAt: null,
  removedByAdmin: false,
  editedAt: null,
  replyTo: null,
  notice: null,
  linkPreview: null,
  sharedPostId: null,
  ...o,
});
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => message(from + i));
const ids = (loaded: LoadedMessages) => loaded.messages.map((m) => m.id);
const pending = message(999, { id: 'pending:1', pending: true });

beforeEach(() => {
  db.rows = Array.from({ length: 250 }, (_, n) => row(n));
  db.requests = [];
  db.fail = false;
  db.threadFound = true;
  db.rpc = [];
});

describe('laying the newest page over what is loaded', () => {
  it('keeps older messages it reaches back to, and bubbles still sending', () => {
    const current = { messages: [...range(0, 9), pending], earlier: true };
    const next = mergeNewest(current, range(5, 12), true);
    expect(ids(next)).toEqual([...ids({ messages: range(0, 12), earlier: true }), 'pending:1']);
    expect(next.earlier).toBe(true);
  });

  it('drops a message that is gone from the page, such as a blocked member’s', () => {
    const page = range(5, 12).filter((m) => m.id !== 'm0007');
    expect(ids(mergeNewest({ messages: range(0, 9), earlier: false }, page, true))).not.toContain(
      'm0007',
    );
  });

  it('starts again from the page when there is a gap since the last read', () => {
    const next = mergeNewest({ messages: range(0, 4), earlier: false }, range(10, 12), true);
    expect(ids(next)).toEqual(ids({ messages: range(10, 12), earlier: true }));
    expect(next.earlier).toBe(true);
  });

  it('is the whole conversation when nothing lies before the page', () => {
    const next = mergeNewest({ messages: range(0, 4), earlier: true }, range(2, 6), false);
    expect(ids(next)).toEqual(ids({ messages: range(2, 6), earlier: false }));
    expect(next.earlier).toBe(false);
  });
});

describe('earlier messages and single changes', () => {
  it('puts earlier messages in front, once', () => {
    const next = mergeEarlier(
      { messages: range(5, 9), earlier: true },
      range(2, 5),
      false,
      'm0005',
    );
    expect(ids(next)).toEqual(ids({ messages: range(2, 9), earlier: false }));
  });

  it('leaves the list alone if it no longer starts where they were read from', () => {
    const current = { messages: range(6, 9), earlier: true };
    expect(mergeEarlier(current, range(2, 4), false, 'm0005')).toBe(current);
  });

  it('replaces an edited message in place and adds a new one in order', () => {
    const current = { messages: [...range(0, 3), pending], earlier: false };
    const edited = upsertMessage(current, message(2, { body: 'Changed.' }));
    expect(edited.messages[2]?.body).toBe('Changed.');
    const added = upsertMessage(current, message(4));
    expect(ids(added)).toEqual(['m0000', 'm0001', 'm0002', 'm0003', 'm0004', 'pending:1']);
  });

  it('leaves a message older than the loaded run for Show earlier', () => {
    const current = { messages: range(5, 9), earlier: true };
    expect(upsertMessage(current, message(1))).toBe(current);
    expect(dropMessage(current, 'm0007').messages).toHaveLength(4);
  });

  it('reads strictly before a message, ties broken by id', () => {
    expect(beforeFilter({ createdAt: '2026-01-01T00:00:00+00:00', id: 'abc' })).toBe(
      'created_at.lt."2026-01-01T00:00:00+00:00",and(created_at.eq."2026-01-01T00:00:00+00:00",id.lt.abc)',
    );
  });
});

const opened = async () => {
  const hook = renderHook(() => useThreadMessages('t1'));
  await waitFor(() => {
    expect(hook.result.current.loading).toBe(false);
  });
  return hook;
};

describe('a long conversation', () => {
  it('opens with one read of the newest page', async () => {
    const { result } = await opened();
    expect(db.requests).toEqual(['']);
    expect(result.current.messages).toHaveLength(MESSAGE_PAGE);
    expect(result.current.messages.at(-1)?.id).toBe('m0249');
    expect(result.current.hasEarlier).toBe(true);
  });

  it('shows earlier messages a page at a time, until there are none', async () => {
    const { result } = await opened();
    await act(() => result.current.loadEarlier());
    expect(result.current.messages).toHaveLength(200);
    expect(result.current.messages[0]?.id).toBe('m0050');
    expect(result.current.hasEarlier).toBe(true);
    await act(() => result.current.loadEarlier());
    expect(result.current.messages).toHaveLength(250);
    expect(result.current.messages[0]?.id).toBe('m0000');
    expect(result.current.hasEarlier).toBe(false);
    expect(new Set(result.current.messages.map((m) => m.id)).size).toBe(250);
  });

  it('pages through messages that share one timestamp', async () => {
    db.rows = Array.from({ length: 150 }, (_, n) => row(n, { created_at: at(0) }));
    const { result } = await opened();
    await act(() => result.current.loadEarlier());
    expect(result.current.messages).toHaveLength(150);
    expect(result.current.hasEarlier).toBe(false);
  });

  it('fetches only the message that changed, and adds or updates it', async () => {
    const { result } = await opened();
    db.requests = [];
    db.rows.push(row(250));
    act(() => {
      result.current.changed({ id: 'm0250' });
    });
    await waitFor(() => {
      expect(result.current.messages.at(-1)?.id).toBe('m0250');
    });
    const target = db.rows.find((r) => r.id === 'm0200');
    if (target) target.body = 'Edited.';
    act(() => {
      result.current.changed({ id: 'm0200' });
    });
    await waitFor(() => {
      expect(result.current.messages.find((m) => m.id === 'm0200')?.body).toBe('Edited.');
    });
    expect(db.requests).toEqual(['id=m0250', 'id=m0200']);
    expect(result.current.messages).toHaveLength(MESSAGE_PAGE + 1);
  });

  it('takes a message out when the reader can no longer read it', async () => {
    const { result } = await opened();
    db.rows = db.rows.filter((r) => r.id !== 'm0240');
    act(() => {
      result.current.changed({ id: 'm0240' });
    });
    await waitFor(() => {
      expect(result.current.messages.some((m) => m.id === 'm0240')).toBe(false);
    });
  });

  it('reads back to a linked message older than the newest page', async () => {
    const { result } = await opened();
    let found = false;
    await act(async () => {
      found = await result.current.reveal('m0010');
    });
    expect(found).toBe(true);
    expect(result.current.messages[0]?.id).toBe('m0010');
    expect(result.current.messages).toHaveLength(240);
    await act(async () => {
      found = await result.current.reveal('nowhere');
    });
    expect(found).toBe(false);
  });

  it('keeps the conversation when a later read fails, and says so', async () => {
    const { result } = await opened();
    db.fail = true;
    await act(async () => {
      result.current.reload();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.stale).toBeTruthy();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.thread).not.toBeNull();
    expect(result.current.messages).toHaveLength(MESSAGE_PAGE);
    db.fail = false;
    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(result.current.stale).toBeNull();
    });
  });

  it('shows the error when the first read fails', async () => {
    db.fail = true;
    const { result } = await opened();
    expect(result.current.error).toBeTruthy();
    expect(result.current.thread).toBeNull();
  });
});
