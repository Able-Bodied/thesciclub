import { useCallback, useEffect, useRef, useState } from 'react';
import { useRealtimeRows } from '@/lib/chat/realtime';
import type { ChatMessage, ThreadKind } from '@/lib/chat/types';
import { readPages } from '@/lib/read-pages';
import { getSupabase } from '@/lib/supabase';

/** A time with its zone, so it is not read as local time. */
const ZONED = /(?:Z|[+-]\d{2}:\d{2})$/;

/** Postgres keeps microseconds; Date alone can mark a later message read early. */
function instant(value: string): bigint | null {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const fraction = /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] ?? '';
  return BigInt(milliseconds) * 1000n + BigInt(fraction.padEnd(6, '0').slice(3, 6));
}

/** True when `a` is a later time than `b`. */
function later(a: string, b: string): boolean {
  const x = instant(a);
  const y = instant(b);
  return x !== null && (y === null || x > y);
}

/** A receipt belongs to a saved message and counts only the other members. */
export function readReceipt(
  message: ChatMessage,
  kind: ThreadKind,
  reads: ReadonlyMap<string, string> | null,
): string | null {
  if (!reads || message.pending || message.removedAt || message.notice || !message.authorId)
    return null;
  const sent = instant(message.createdAt);
  if (sent === null) return null;
  let recipients = 0;
  let readers = 0;
  for (const [memberId, lastReadAt] of reads) {
    if (memberId === message.authorId) continue;
    recipients += 1;
    const read = instant(lastReadAt);
    if (read !== null && read >= sent) readers += 1;
  }
  if (readers === 0) return null;
  return kind === 'direct' ? 'Read' : `Read by ${readers} of ${recipients}`;
}

/** Receipt refreshes never reload messages or mark this member's thread read.
 * Keeping the two separate prevents a receipt update from producing another one.
 * RLS already limits roster reads and realtime events to this conversation's members.
 */
export function useThreadReadReceipts(threadId: string | undefined) {
  const [reads, setReads] = useState<Map<string, string> | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    if (!threadId) {
      setReads(null);
      return;
    }
    try {
      const result = await readPages<{ member_id: string; last_read_at: string }>((from, to) =>
        getSupabase()
          .from('chat_thread_members')
          .select('member_id, last_read_at')
          .eq('thread_id', threadId)
          .order('member_id')
          .range(from, to)
          .abortSignal(controller.signal),
      );
      if (controller.signal.aborted) return;
      if (result.error) {
        setReads(null);
        return;
      }
      // A newer position heard live while this read was out is kept.
      setReads((old) => {
        const next = new Map<string, string>();
        for (const row of result.data ?? []) {
          const heard = old?.get(row.member_id);
          next.set(
            row.member_id,
            heard && later(heard, row.last_read_at) ? heard : row.last_read_at,
          );
        }
        return next;
      });
    } catch {
      if (!controller.signal.aborted) setReads(null);
    }
  }, [threadId]);

  useEffect(() => {
    setReads(null);
    void reload();
    return () => inFlight.current?.abort();
  }, [reload]);

  // A changed row is applied as it came, not read again: each message moved
  // every reader's row, and each move re-read the roster for everybody.
  const onRow = useCallback(
    (row: Record<string, unknown>) => {
      const member = row.member_id;
      const at = row.last_read_at;
      if (
        row.thread_id !== threadId ||
        typeof member !== 'string' ||
        typeof at !== 'string' ||
        !ZONED.test(at) ||
        instant(at) === null
      ) {
        void reload();
        return;
      }
      setReads((old) => {
        const before = old?.get(member);
        if (!old || (before !== undefined && !later(at, before))) return old;
        return new Map(old).set(member, at);
      });
    },
    [threadId, reload],
  );
  useRealtimeRows({
    table: 'chat_thread_members',
    filter: threadId ? `thread_id=eq.${threadId}` : undefined,
    enabled: Boolean(threadId),
    onChange: () => {
      void reload();
    },
    onRow,
  });
  return reads;
}
