import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from '@/lib/account';
import type { ChatMessage, ChatThread } from '@/lib/chat/types';
import { unreadChanged } from '@/lib/chat/unread';
import { getSupabase } from '@/lib/supabase';

/**
 * Direct conversations: the chat half of Chat.
 *
 * ---------------------------------------------------------------------------
 * The list comes from a function, the messages from the table
 * ---------------------------------------------------------------------------
 * `chat_my_threads()` answers four questions per conversation at once — who
 * the other member is, how big a group is, what was said last, and whether
 * there is anything new — because the alternative is four queries a row on a
 * phone. It is `security invoker`, so RLS is what scopes it and there is no
 * gate inside it to be wrong about.
 *
 * Messages are read straight from `chat_messages` and written straight to it.
 * Only the things that touch somebody else's row go through a function:
 * creating the thread (it adds the other person), marking it read (the server's
 * clock), removing (the author or an administrator).
 *
 * A removed message comes back with an empty body because the database blanked
 * the column, so there is no client-side rule about what to hide and no way for
 * the words to arrive and be suppressed. The same reason there is no
 * `chat_messages_visible` view: realtime reads tables.
 *
 * ---------------------------------------------------------------------------
 * A thread's composer is optimistic; a topic's is not
 * ---------------------------------------------------------------------------
 * The one place in Chat where a write is drawn before the database has seen it.
 * A message is a sentence and the round trip is felt — a bubble that appears
 * half a second after you press send makes a conversation feel like a form. A
 * post in a room is four paragraphs somebody has just finished writing, and
 * nobody is watching for it to appear.
 *
 * Optimistic *with an undo*, the same shape as following an organization: the
 * bubble is appended, and if the write is refused it is taken back out and the
 * composer is handed its words and the reason. What must never happen is a
 * bubble that stays on screen having never been saved.
 */

/**
 * What a supabase call hands back, named so that rpc results can be cast to it.
 * `rpc()` is untyped without generated database types, and an untyped result
 * spreads `any` through every line that touches it.
 */
interface Result<T> {
  data: T | null;
  error: { message: string } | null;
}

interface ThreadRow {
  id: string;
  kind: string;
  name: string | null;
  event_id: string | null;
  created_at: string;
  last_message_at: string;
  member_count: number | string;
  other_member_id: string | null;
  last_body: string | null;
  last_author_id: string | null;
  last_at: string | null;
  last_removed: boolean | null;
  unread: boolean;
}

function toThread(row: ThreadRow): ChatThread {
  return {
    id: row.id,
    // The column is checked against exactly these two, so anything else means
    // the check changed without this doing. A pair is the less surprising thing
    // to draw than a group with no name.
    kind: row.kind === 'group' ? 'group' : 'direct',
    name: row.name,
    eventId: row.event_id,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
    // bigint: a string once it passes 2^53, a number before that.
    memberCount: Number(row.member_count),
    otherMemberId: row.other_member_id,
    lastBody: row.last_body,
    lastAuthorId: row.last_author_id,
    lastAt: row.last_at,
    lastRemoved: row.last_removed ?? false,
    unread: row.unread,
  };
}

interface MessageRow {
  id: string;
  thread_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  removed_at: string | null;
  removed_by_admin: boolean;
}

const MESSAGE_COLUMNS = 'id, thread_id, author_id, body, created_at, removed_at, removed_by_admin';

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
    removedAt: row.removed_at,
    removedByAdmin: row.removed_by_admin,
  };
}

export type ChatWriteResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * What a conversation is called, and what goes under the name.
 *
 * Pure, and the one place the four cases are written down, so the list row and
 * the thread header cannot disagree about what to call the same conversation:
 *
 *  - a group is its name;
 *  - a direct thread is the other member's name;
 *  - a direct thread whose other half has left the club is "Former member" —
 *    their words stay and their name does not, which is the owner's decision;
 *  - a name still loading is an empty string rather than "Unknown", because it
 *    is about to be a name and a row that says Unknown and then says Jan has
 *    told the reader something untrue on the way.
 */
export function threadTitle(thread: ChatThread, otherName: string | null): string {
  if (thread.kind === 'group') return thread.name ?? 'Group';
  if (!thread.otherMemberId) return 'Former member';
  return otherName ?? '';
}

/**
 * Whether the message list should follow a new message down.
 *
 * Only if the reader was already at the bottom, within a line or so. Somebody
 * who has scrolled up is reading something; yanking them to the newest message
 * takes the page away mid-sentence, which is worse than making them tap a pill
 * to go back down.
 *
 * Pure and tested, because the alternative is finding out on a real device that
 * the threshold was zero and nothing ever followed.
 */
export const FOLLOW_SCROLL_SLACK = 80;

export function shouldFollowScroll(distanceFromBottom: number): boolean {
  return distanceFromBottom <= FOLLOW_SCROLL_SLACK;
}

export interface MyThreadsState {
  threads: ChatThread[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Every conversation the viewer is in, newest activity first. */
export function useMyThreads(): MyThreadsState {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The read in flight, so a reload cancels the one before it and unmounting
  // cancels whichever is running. The same shape as useChatRooms.
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const aborted = () => controller.signal.aborted;

    try {
      const { data, error: failure } = (await getSupabase()
        .rpc('chat_my_threads')
        .abortSignal(controller.signal)) as Result<ThreadRow[]>;
      if (aborted()) return;
      if (failure) {
        // A database that predates 20260918090000 has no such function, and the
        // screen should lose its list rather than its page.
        setThreads([]);
        setError(failure.message);
        setLoading(false);
        return;
      }
      setThreads((data ?? []).map(toThread));
      setError(null);
      setLoading(false);
    } catch (e) {
      if (aborted()) return;
      setThreads([]);
      setError(e instanceof Error ? e.message : 'Could not load your conversations.');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      inFlight.current?.abort();
    };
  }, [load]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return { threads, loading, error, reload };
}

export interface ThreadMessagesState {
  /** The thread itself, or null while loading and when it cannot be read. */
  thread: ChatThread | null;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Append a bubble, write it, and take it back out if it is refused. */
  send: (body: string) => Promise<string | null>;
  /** Remove a message: the reader's own, or anybody's for an administrator. */
  remove: (messageId: string) => Promise<string | null>;
}

/**
 * One conversation and everything said in it.
 *
 * Two reads: the thread's own row out of `chat_my_threads` — which is where the
 * other member, the size of a group and the name live — and the messages. Then
 * it marks the thread read, which is a function and sets the server's clock, so
 * nothing here sends a timestamp.
 *
 * A thread the viewer is not in comes back as `thread: null` with no error,
 * because that is what it looks like to them: not a refusal, an absence. The
 * screen says the conversation cannot be shown rather than printing a policy
 * failure at somebody.
 */
export function useThreadMessages(threadId: string | undefined): ThreadMessagesState {
  const account = useAccount();
  const memberId = account.status === 'member' ? account.userId : null;

  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  // Only ever incremented, so two pending bubbles cannot collide on a key.
  const pendingCount = useRef(0);

  const load = useCallback(async () => {
    if (!threadId) {
      setLoading(false);
      return;
    }
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const aborted = () => controller.signal.aborted;
    const supabase = getSupabase();

    try {
      const [threads, messageRows] = (await Promise.all([
        supabase.rpc('chat_my_threads').abortSignal(controller.signal),
        supabase
          .from('chat_messages')
          .select(MESSAGE_COLUMNS)
          .eq('thread_id', threadId)
          .order('created_at')
          .abortSignal(controller.signal),
      ])) as [Result<ThreadRow[]>, Result<MessageRow[]>];
      if (aborted()) return;

      const failure = threads.error ?? messageRows.error;
      if (failure) {
        setError(failure.message);
        setLoading(false);
        return;
      }

      const found = (threads.data ?? []).find((row) => row.id === threadId) ?? null;
      setThread(found ? toThread(found) : null);
      // Replaces rather than merges, so a pending bubble that has already been
      // confirmed cannot appear twice.
      setMessages((messageRows.data ?? []).map(toMessage));
      setError(null);
      setLoading(false);

      // After the read, not before, and silent on failure: the conversation is
      // on screen and unread is a convenience. The dot in the tab bar is told
      // either way — it is about to be wrong, and it is not on this screen to
      // notice.
      if (found) {
        void supabase.rpc('chat_mark_thread_read', { thread: threadId }).then(() => {
          unreadChanged();
        });
      }
    } catch (e) {
      if (aborted()) return;
      setError(e instanceof Error ? e.message : 'Could not load the conversation.');
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void load();
    return () => {
      inFlight.current?.abort();
    };
  }, [load]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  const send = useCallback(
    async (body: string): Promise<string | null> => {
      if (!threadId) return 'This conversation is gone.';
      if (!memberId) return 'You are signed out.';

      pendingCount.current += 1;
      const pendingId = `pending:${pendingCount.current}`;
      setMessages((current) => [
        ...current,
        {
          id: pendingId,
          threadId,
          authorId: memberId,
          body,
          // The reader's own clock, and only ever used to draw this bubble for
          // the second it exists. The row that replaces it carries the
          // server's, which is the one everything is ordered and compared by.
          createdAt: new Date().toISOString(),
          removedAt: null,
          removedByAdmin: false,
          pending: true,
        },
      ]);

      const result = await sendMessage(threadId, memberId, body);
      if (!result.ok) {
        // The undo. A bubble that stays on screen having never been saved is
        // the one thing this must not do.
        setMessages((current) => current.filter((message) => message.id !== pendingId));
        return result.error;
      }
      const saved = result.value;
      setMessages((current) =>
        current.map((message) => (message.id === pendingId ? saved : message)),
      );
      return null;
    },
    [threadId, memberId],
  );

  const remove = useCallback(async (messageId: string): Promise<string | null> => {
    const result = await removeMessage(messageId);
    if (!result.ok) return result.error;
    // Not optimistic. Removal is rare, deliberate and irreversible, and the
    // sentence that replaces the body — by its author, or by an administrator —
    // is derived by the database rather than guessed here.
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? { ...message, body: '', removedAt: new Date().toISOString() }
          : message,
      ),
    );
    return null;
  }, []);

  return { thread, messages, loading, error, reload, send, remove };
}

/**
 * The conversation between the viewer and one other member, made if it is not
 * there.
 *
 * Returns the thread id so the caller can navigate straight to it. Calling it
 * twice is harmless — `direct_key` is unique and the function re-selects — so
 * the Message button does not have to guard against a double tap.
 */
export async function openDirect(memberId: string): Promise<ChatWriteResult<string>> {
  const { data, error } = (await getSupabase().rpc('chat_open_direct', {
    other: memberId,
  })) as Result<string>;
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'The conversation was not opened.' };
  return { ok: true, value: data };
}

/** Say something. The insert policy is what decides; this only asks. */
export async function sendMessage(
  threadId: string,
  authorId: string,
  body: string,
): Promise<ChatWriteResult<ChatMessage>> {
  const { data, error } = (await getSupabase()
    .from('chat_messages')
    // Exactly the three columns insert is granted on. created_at, removed_at
    // and removed_by_admin belong to the database — see 20260918070000 — and
    // naming one here would fail with `permission denied for column`.
    .insert({ thread_id: threadId, author_id: authorId, body })
    .select(MESSAGE_COLUMNS)
    .single()) as Result<MessageRow>;
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'The message was not sent.' };
  return { ok: true, value: toMessage(data) };
}

/**
 * Remove a message. The author's own, or anybody's if the caller is an
 * administrator — `chat_remove_message` decides and refuses in a sentence.
 */
export async function removeMessage(messageId: string): Promise<ChatWriteResult<null>> {
  const { error } = await getSupabase().rpc('chat_remove_message', { message: messageId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: null };
}
