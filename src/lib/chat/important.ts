import { useCallback, useEffect, useRef, useState } from 'react';
import { useRealtimeRows } from '@/lib/chat/realtime';
import { getSupabase } from '@/lib/supabase';

/**
 * Important messages in group chats (the owner, 2026-11-13; 20261113140000).
 *
 * Whoever started a group, a club administrator in it, or an event's
 * organizers in its group chat can mark a message Important. Everyone else in
 * the group (but whoever marked it and whoever wrote it) is told, reminded
 * twice, two hours apart, and sees it pinned at the top of the conversation
 * and of the bell until they press Acknowledge. Anyone in the group can see
 * who has.
 */

export interface ImportantMessage {
  messageId: string;
  markedBy: string | null;
  markedAt: string;
  authorId: string | null;
  authorName: string | null;
  body: string;
  photoCount: number;
  /** Everyone asked to acknowledge it. */
  asked: string[];
  /** Those of them who have, oldest first. */
  acknowledged: string[];
}

export interface ThreadImportant {
  /** Whether the reader may mark and unmark here. */
  canMark: boolean;
  items: ImportantMessage[];
}

interface ThreadImportantRow {
  can_mark?: boolean;
  items?: {
    message_id: string;
    marked_by: string | null;
    marked_at: string;
    author_id: string | null;
    author_name: string | null;
    body: string | null;
    photo_count: number | null;
    asked: string[] | null;
    acknowledged: { member_id: string; at: string }[] | null;
  }[];
}

const NONE: ThreadImportant = { canMark: false, items: [] };

export function toThreadImportant(row: ThreadImportantRow | null): ThreadImportant {
  if (!row) return NONE;
  return {
    canMark: row.can_mark === true,
    items: (row.items ?? []).map((item) => ({
      messageId: item.message_id,
      markedBy: item.marked_by,
      markedAt: item.marked_at,
      authorId: item.author_id,
      authorName: item.author_id ? item.author_name : null,
      body: item.body ?? '',
      photoCount: item.photo_count ?? 0,
      asked: item.asked ?? [],
      acknowledged: (item.acknowledged ?? []).map((a) => a.member_id),
    })),
  };
}

/**
 * A group's Important messages, kept current: a marking, an unmarking or an
 * acknowledgement anywhere in the group reads them again. Nothing for a pair,
 * or before the database has the function (an older project answers with an
 * error, which is read as none).
 */
export function useThreadImportant(
  threadId: string | undefined,
  isGroup: boolean,
): ThreadImportant & { reload: () => void } {
  const [state, setState] = useState<ThreadImportant>(NONE);
  const generation = useRef(0);

  const reload = useCallback(() => {
    if (!threadId || !isGroup) return;
    generation.current += 1;
    const mine = generation.current;
    void getSupabase()
      .rpc('chat_thread_important', { p_thread: threadId })
      .then(({ data, error }) => {
        if (mine !== generation.current || error) return;
        setState(toThreadImportant(data as ThreadImportantRow | null));
      });
  }, [threadId, isGroup]);

  useEffect(() => {
    reload();
  }, [reload]);

  const live = Boolean(threadId) && isGroup;
  const filter = threadId ? `thread_id=eq.${threadId}` : undefined;
  useRealtimeRows({ table: 'chat_important_messages', filter, onChange: reload, enabled: live });
  useRealtimeRows({ table: 'chat_important_acks', filter, onChange: reload, enabled: live });

  return { ...state, reload };
}

type Write = { ok: true } | { ok: false; error: string };

async function write(fn: string, args: Record<string, unknown>, fallback: string): Promise<Write> {
  const { error } = await getSupabase().rpc(fn, args);
  if (!error) return { ok: true };
  return { ok: false, error: error.message || fallback };
}

export function markImportant(messageId: string, important: boolean): Promise<Write> {
  return write(
    'chat_mark_important',
    { p_message: messageId, p_important: important },
    important ? 'Could not mark it Important.' : 'Could not take Important off.',
  );
}

export function acknowledgeImportant(messageId: string): Promise<Write> {
  return write('chat_acknowledge_important', { p_message: messageId }, 'Could not acknowledge it.');
}

/** Pushes whoever has not acknowledged once more; at most every 2 hours. */
export function remindImportant(messageId: string): Promise<Write> {
  return write('chat_remind_important', { p_message: messageId }, 'Could not send a reminder.');
}

export interface ImportantPerson {
  memberId: string;
  displayName: string;
  photoPath: string | null;
  photoAlt: string | null;
  /** Null while they have not. */
  acknowledgedAt: string | null;
}

export async function fetchImportantPeople(messageId: string): Promise<ImportantPerson[]> {
  const { data, error } = (await getSupabase().rpc('chat_important_people', {
    p_message: messageId,
  })) as {
    data:
      | {
          member_id: string;
          display_name: string;
          photo_path: string | null;
          photo_alt: string | null;
          acknowledged_at: string | null;
        }[]
      | null;
    error: { message: string } | null;
  };
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    memberId: row.member_id,
    displayName: row.display_name,
    photoPath: row.photo_path,
    photoAlt: row.photo_alt,
    acknowledgedAt: row.acknowledged_at,
  }));
}

/** One Important message the reader has still to acknowledge: the top of the bell. */
export interface WaitingImportant {
  messageId: string;
  threadId: string;
  group: string;
  authorName: string | null;
  body: string;
  photoCount: number;
  markedAt: string;
}

export async function fetchMyImportant(): Promise<WaitingImportant[]> {
  const { data, error } = (await getSupabase().rpc('chat_my_important')) as {
    data:
      | {
          message_id: string;
          thread_id: string;
          thread_name: string | null;
          author_id: string | null;
          author_name: string | null;
          body: string;
          photo_count: number | null;
          marked_at: string;
        }[]
      | null;
    error: { message: string } | null;
  };
  // An older database has no such function: nothing waits.
  if (error) return [];
  return (data ?? []).map((row) => ({
    messageId: row.message_id,
    threadId: row.thread_id,
    group: row.thread_name ?? 'Group chat',
    authorName: row.author_id ? row.author_name : null,
    body: row.body,
    photoCount: row.photo_count ?? 0,
    markedAt: row.marked_at,
  }));
}
