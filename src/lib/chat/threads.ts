import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from '@/lib/account';
import { holdBadgesFor } from '@/lib/badges';
import { deleteAttachments, MAX_ATTACHMENTS } from '@/lib/chat/attachments';
import { toLinkPreview } from '@/lib/chat/link-preview';
import { CHAT_NOTICES, type ChatMessage, type ChatNotice, type ChatThread } from '@/lib/chat/types';
import { unreadChanged } from '@/lib/chat/unread';
import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { announceNotificationsChanged } from '@/lib/notifications';
import { readPages } from '@/lib/read-pages';
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
  error: Failure | null;
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
  photo_path: string | null;
  last_notice: string | null;
}

/**
 * A notice as the database spelled it, or null.
 *
 * The column is checked against exactly these three, so anything else means
 * the check changed without this doing. Null is the safer reading: the row is
 * then drawn as an ordinary message with its words, not as a change nobody
 * made.
 */
function toNotice(raw: string | null | undefined): ChatNotice | null {
  return (CHAT_NOTICES as readonly string[]).includes(raw ?? '') ? (raw as ChatNotice) : null;
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
    photoPath: row.photo_path ?? null,
    lastNotice: toNotice(row.last_notice),
  };
}

interface MessageRow {
  id: string;
  thread_id: string;
  author_id: string | null;
  body: string;
  attachments: string[] | null;
  created_at: string;
  removed_at: string | null;
  removed_by_admin: boolean;
  edited_at: string | null;
  reply_to: string | null;
  notice: string | null;
  link_preview: unknown;
  shared_post_id: string | null;
}

const MESSAGE_COLUMNS =
  'id, thread_id, author_id, body, attachments, created_at, removed_at, removed_by_admin, edited_at, reply_to, notice, link_preview, shared_post_id';

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    authorId: row.author_id,
    body: row.body,
    attachments: row.attachments ?? [],
    createdAt: row.created_at,
    removedAt: row.removed_at,
    removedByAdmin: row.removed_by_admin,
    editedAt: row.edited_at,
    replyTo: row.reply_to,
    notice: toNotice(row.notice),
    linkPreview: toLinkPreview(row.link_preview),
    sharedPostId: row.shared_post_id ?? null,
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
 *  - a direct thread whose other half has left the club is "Deleted member" —
 *    their words stay and their name does not, which is the owner's decision;
 *  - a name still loading is an empty string rather than "Unknown", because it
 *    is about to be a name and a row that says Unknown and then says Jan has
 *    told the reader something untrue on the way.
 */
export function threadTitle(thread: ChatThread, otherName: string | null): string {
  if (thread.kind === 'group') return thread.name ?? 'Group';
  if (!thread.otherMemberId) return 'Deleted member';
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

/** How much of a quoted message is shown over the reply that answers it. */
export const QUOTE_LENGTH = 80;

/**
 * The words of a quote: what the answered message said, cut short.
 *
 * Pure, so the three special cases are tested without a screen: a message
 * that has been taken back reads "Removed message" — the quote stays, since
 * the reply still answers something, and a gap with a reason reads better
 * than a quote that silently disappears; a message that was a photograph
 * alone reads "Photograph", and a shared post alone "Shared post"; and one
 * not in the list at all, which a read
 * that is mid-flight can produce, reads "Earlier message" rather than
 * nothing. The cut is by characters and not words, since a message that is
 * one long word is still a message.
 */
export function quoteText(message: ChatMessage | undefined): string {
  if (!message) return 'Earlier message';
  if (message.removedAt !== null) return 'Removed message';
  const words = message.body.trim().replace(/\s+/g, ' ');
  if (words === '') {
    if (message.attachments.length > 0) return 'Photograph';
    return message.sharedPostId ? 'Shared post' : 'Earlier message';
  }
  if (words.length <= QUOTE_LENGTH) return words;
  return `${words.slice(0, QUOTE_LENGTH).trimEnd()}…`;
}

/**
 * What a line about a change to the group says, with who did it in front.
 *
 * `who` is "You", a name, or "A deleted member", decided by the caller, which
 * knows who is reading. Pure, so the conversation and the list cannot word the
 * same change two ways. `withName` is false in the list, where "Jan renamed
 * the group" is the whole of what fits and the new name is the row's title.
 */
export function noticeText(notice: ChatNotice, who: string, body: string, withName = true): string {
  if (notice === 'renamed') {
    return withName && body ? `${who} renamed the group to “${body}”` : `${who} renamed the group`;
  }
  if (notice === 'pictured') return `${who} changed the group’s picture`;
  // A professional's introduction (20261029120000); the body is their note.
  if (notice === 'introduced')
    return who === 'You'
      ? 'You connected them because you thought they’d be a good fit'
      : `${who} connected you because they thought you’d be a good fit`;
  return `${who} took the group’s picture away`;
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
        setError(describeError(failure, 'Could not load your conversations.'));
        setLoading(false);
        return;
      }
      setThreads((data ?? []).map(toThread));
      setError(null);
      setLoading(false);
    } catch (e) {
      if (aborted()) return;
      setThreads([]);
      setError(describeThrown(e, 'Could not load your conversations.'));
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

/** How many messages a conversation reads at a time, newest first. */
export const MESSAGE_PAGE = 100;

/** The server's order: oldest first, by time and then id. */
export function messageOrder(a: ChatMessage, b: ChatMessage): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** What is on screen: a run of the newest messages, and whether more lie before it. */
export interface LoadedMessages {
  messages: ChatMessage[];
  earlier: boolean;
}

function split(messages: readonly ChatMessage[]) {
  return {
    confirmed: messages.filter((m) => !m.pending),
    pending: messages.filter((m) => m.pending),
  };
}

/**
 * The newest page laid over what is loaded. Older messages already loaded stay
 * when the page reaches back to them; with a gap between (a long time
 * offline) only the page stays. Bubbles still sending are kept at the end.
 */
export function mergeNewest(
  current: LoadedMessages,
  page: readonly ChatMessage[],
  more: boolean,
): LoadedMessages {
  const { confirmed, pending } = split(current.messages);
  const oldest = page[0];
  if (!oldest || !more) return { messages: [...page, ...pending], earlier: false };
  const newest = confirmed.at(-1);
  if (!newest || messageOrder(newest, oldest) < 0) {
    return { messages: [...page, ...pending], earlier: true };
  }
  const older = confirmed.filter((m) => messageOrder(m, oldest) < 0);
  return { messages: [...older, ...page, ...pending], earlier: current.earlier };
}

/**
 * Earlier messages put in front, if the list still starts where they were read
 * back from (`before`); otherwise the list changed meanwhile and they wait.
 */
export function mergeEarlier(
  current: LoadedMessages,
  page: readonly ChatMessage[],
  more: boolean,
  before: string | null,
): LoadedMessages {
  const { confirmed } = split(current.messages);
  if ((confirmed[0]?.id ?? null) !== before) return current;
  const have = new Set(current.messages.map((m) => m.id));
  return {
    messages: [...page.filter((m) => !have.has(m.id)), ...current.messages],
    earlier: more,
  };
}

/**
 * One message added or replaced in place. One older than the loaded run is
 * left for Show earlier to bring.
 */
export function upsertMessage(current: LoadedMessages, message: ChatMessage): LoadedMessages {
  if (current.messages.some((m) => m.id === message.id)) {
    return {
      ...current,
      messages: current.messages.map((m) => (m.id === message.id ? message : m)),
    };
  }
  const { confirmed, pending } = split(current.messages);
  const first = confirmed[0];
  if (current.earlier && first && messageOrder(message, first) < 0) return current;
  const at = confirmed.findIndex((m) => messageOrder(message, m) < 0);
  const next = [...confirmed];
  next.splice(at === -1 ? next.length : at, 0, message);
  return { ...current, messages: [...next, ...pending] };
}

/** A message the reader can no longer see (a block, a removal from view). */
export function dropMessage(current: LoadedMessages, id: string): LoadedMessages {
  return current.messages.some((m) => m.id === id)
    ? { ...current, messages: current.messages.filter((m) => m.id !== id) }
    : current;
}

/** PostgREST's "strictly before this message", in server order. */
export function beforeFilter(message: Pick<ChatMessage, 'createdAt' | 'id'>): string {
  const at = `"${message.createdAt}"`;
  return `created_at.lt.${at},and(created_at.eq.${at},id.lt.${message.id})`;
}

export interface ThreadMessagesState {
  /** The thread itself, or null while loading and when it cannot be read. */
  thread: ChatThread | null;
  messages: ChatMessage[];
  loading: boolean;
  /** Only when the first read fails: there is nothing to show. */
  error: string | null;
  /** A later read failed; what is on screen stays. */
  stale: string | null;
  /** Older messages exist than the ones loaded. */
  hasEarlier: boolean;
  loadingEarlier: boolean;
  earlierError: string | null;
  /** Read the page before the oldest loaded. */
  loadEarlier: () => Promise<void>;
  /** Load back to one message (a link to it); false if it cannot be found. */
  reveal: (messageId: string) => Promise<boolean>;
  reload: () => void;
  /** A live change to one row: fetch just that message. */
  changed: (row: Record<string, unknown>) => void;
  /**
   * Append a bubble, write it, and take it back out if it is refused. Words,
   * the paths of photographs already uploaded under this thread, and the
   * message this one answers, if any.
   */
  send: (body: string, attachments?: string[], replyTo?: string | null) => Promise<string | null>;
  /** Change the words of the reader's own message. Not optimistic: see below. */
  edit: (messageId: string, body: string) => Promise<string | null>;
  /** Remove a message: the reader's own, or anybody's for an administrator. */
  remove: (messageId: string) => Promise<string | null>;
}

/**
 * One conversation: its row out of `chat_my_threads` (the other member, a
 * group's size and name) and its newest MESSAGE_PAGE messages, with Show
 * earlier for the rest. A live change fetches only that message; a reconnect
 * or a return reads the newest page again and lays it over what is loaded.
 * Then it marks the thread read, by the server's clock.
 *
 * A thread the viewer is not in comes back as `thread: null` with no error:
 * to them it is an absence, not a refusal.
 */
export function useThreadMessages(threadId: string | undefined): ThreadMessagesState {
  const account = useAccount();
  const memberId = account.status === 'member' ? account.userId : null;

  const [thread, setThread] = useState<ChatThread | null>(null);
  const [loaded, setLoaded] = useState<LoadedMessages>({ messages: [], earlier: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState<string | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [earlierError, setEarlierError] = useState<string | null>(null);
  // Latest list for reads that need it outside a setState.
  const now = useRef(loaded);
  now.current = loaded;
  // Aborted when the conversation changes or the screen goes.
  const life = useRef<AbortController | null>(null);
  const shown = useRef(false);
  const refreshing = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const marked = useRef<string | null>(null);
  const fetches = useRef(new Map<string, number>());
  // Only ever incremented, so two pending bubbles cannot collide on a key.
  const pendingCount = useRef(0);

  // Silent on failure: unread is a convenience. The tab bar's dot is told.
  const markThrough = useCallback(
    (through: string | undefined) => {
      if (!threadId || !through || document.visibilityState !== 'visible') return;
      if (marked.current === through) return;
      marked.current = through;
      // The badges wait for it, so the new message's own count sees it read.
      holdBadgesFor(
        getSupabase()
          .rpc('chat_mark_thread_read_through', { thread: threadId, message: through })
          .then(() => {
            unreadChanged();
            // Its notifications are seen now, so the icon drops by them.
            announceNotificationsChanged();
          }),
      );
    },
    [threadId],
  );

  const messagesQuery = useCallback(
    (signal: AbortSignal) =>
      getSupabase()
        .from('chat_messages')
        .select(MESSAGE_COLUMNS)
        .eq('thread_id', threadId ?? '')
        .abortSignal(signal),
    [threadId],
  );

  const readThread = useCallback(async (signal: AbortSignal) => {
    return (await getSupabase().rpc('chat_my_threads').abortSignal(signal)) as Result<ThreadRow[]>;
  }, []);

  const fetchNewest = useCallback(
    async (signal: AbortSignal) => {
      if (!threadId) return;
      const aborted = () => signal.aborted;
      const failed = (text: string) => {
        if (shown.current) setStale(text);
        else setError(text);
        setLoading(false);
      };
      try {
        const [threads, rows] = (await Promise.all([
          readThread(signal),
          // One more than a page says whether there is anything before it.
          messagesQuery(signal)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(0, MESSAGE_PAGE),
        ])) as [Result<ThreadRow[]>, Result<MessageRow[]>];
        if (aborted()) return;
        const failure = threads.error ?? rows.error;
        if (failure) {
          failed(describeError(failure, 'Could not load the conversation.'));
          return;
        }
        const found = (threads.data ?? []).find((row) => row.id === threadId) ?? null;
        const all = rows.data ?? [];
        const page = all.slice(0, MESSAGE_PAGE).reverse().map(toMessage);
        setThread(found ? toThread(found) : null);
        setLoaded((current) => mergeNewest(current, page, all.length > MESSAGE_PAGE));
        shown.current = found !== null;
        setError(null);
        setStale(null);
        setLoading(false);
        if (found) markThrough(page.at(-1)?.id);
      } catch (e) {
        if (aborted()) return;
        failed(describeThrown(e, 'Could not load the conversation.'));
      }
    },
    [threadId, readThread, messagesQuery, markThrough],
  );

  // One at a time; a request meanwhile runs once more after it.
  const refresh = useCallback((): Promise<void> => {
    if (refreshing.current) {
      again.current = true;
      return refreshing.current;
    }
    const signal = life.current?.signal;
    if (!signal) return Promise.resolve();
    // Read through a function: it changes while the read is awaited.
    const queued = () => again.current && !signal.aborted;
    const run = (async () => {
      do {
        again.current = false;
        await fetchNewest(signal);
      } while (queued());
    })().finally(() => {
      if (refreshing.current === run) refreshing.current = null;
    });
    refreshing.current = run;
    return run;
  }, [fetchNewest]);

  useEffect(() => {
    if (!threadId) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    life.current = controller;
    shown.current = false;
    marked.current = null;
    refreshing.current = null;
    void refresh();
    // Shown again: the screen's realtime reads once (src/lib/chat/realtime.ts).
    return () => {
      controller.abort();
    };
  }, [threadId, refresh]);

  const reload = useCallback(() => {
    void refresh();
  }, [refresh]);

  const changed = useCallback(
    (row: Record<string, unknown>) => {
      const id = row.id;
      const signal = life.current?.signal;
      if (typeof id !== 'string' || !signal || !shown.current) {
        void refresh();
        return;
      }
      // The latest fetch of a message wins, whatever order they come back in.
      const turn = (fetches.current.get(id) ?? 0) + 1;
      fetches.current.set(id, turn);
      void (async () => {
        try {
          const { data, error: failure } = (await messagesQuery(signal)
            .eq('id', id)
            .maybeSingle()) as Result<MessageRow>;
          if (signal.aborted || fetches.current.get(id) !== turn) return;
          if (failure) {
            void refresh();
            return;
          }
          if (!data) {
            setLoaded((current) => dropMessage(current, id));
            return;
          }
          const message = toMessage(data);
          setLoaded((current) => upsertMessage(current, message));
          const newest = split(now.current.messages).confirmed.at(-1);
          if (!newest || messageOrder(message, newest) >= 0) markThrough(message.id);
          // A rename or a new picture changes the header.
          if (message.notice) {
            const threads = await readThread(signal);
            const found = (threads.data ?? []).find((r) => r.id === threadId);
            if (found && fetches.current.get(id) === turn) setThread(toThread(found));
          }
        } catch {
          if (!signal.aborted) void refresh();
        }
      })();
    },
    [threadId, refresh, messagesQuery, readThread, markThrough],
  );

  /** Everything from `from` (inclusive, by time) up to the oldest loaded. */
  const readBefore = useCallback(
    async (from: ChatMessage | null): Promise<string | null> => {
      const signal = life.current?.signal;
      if (!threadId || !signal) return null;
      const oldest = split(now.current.messages).confirmed[0];
      if (!oldest) return null;
      if (from) {
        const result = await readPages<MessageRow>((first, last) =>
          messagesQuery(signal)
            .gte('created_at', from.createdAt)
            .or(beforeFilter(oldest))
            .order('created_at')
            .order('id')
            .range(first, last),
        );
        if (signal.aborted) return null;
        if (result.error) return describeError(result.error, 'Could not load earlier messages.');
        const page = (result.data ?? []).map(toMessage);
        setLoaded((current) => mergeEarlier(current, page, true, oldest.id));
        return null;
      }
      const { data, error: failure } = (await messagesQuery(signal)
        .or(beforeFilter(oldest))
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(0, MESSAGE_PAGE)) as Result<MessageRow[]>;
      if (signal.aborted) return null;
      if (failure) return describeError(failure, 'Could not load earlier messages.');
      const all = data ?? [];
      const page = all.slice(0, MESSAGE_PAGE).reverse().map(toMessage);
      setLoaded((current) => mergeEarlier(current, page, all.length > MESSAGE_PAGE, oldest.id));
      return null;
    },
    [threadId, messagesQuery],
  );

  const loadEarlier = useCallback(async () => {
    setLoadingEarlier(true);
    setEarlierError(null);
    try {
      setEarlierError(await readBefore(null));
    } catch (e) {
      setEarlierError(describeThrown(e, 'Could not load earlier messages.'));
    } finally {
      setLoadingEarlier(false);
    }
  }, [readBefore]);

  const reveal = useCallback(
    async (messageId: string): Promise<boolean> => {
      const signal = life.current?.signal;
      if (now.current.messages.some((m) => m.id === messageId)) return true;
      if (!signal || !now.current.earlier) return false;
      setLoadingEarlier(true);
      try {
        const { data } = (await messagesQuery(signal)
          .eq('id', messageId)
          .maybeSingle()) as Result<MessageRow>;
        if (!data || signal.aborted) return false;
        const target = toMessage(data);
        const oldest = split(now.current.messages).confirmed[0];
        if (oldest && messageOrder(target, oldest) >= 0) return false;
        const problem = await readBefore(target);
        if (problem) setEarlierError(problem);
        return problem === null;
      } catch {
        return false;
      } finally {
        if (!signal.aborted) setLoadingEarlier(false);
      }
    },
    [messagesQuery, readBefore],
  );

  const send = useCallback(
    async (
      body: string,
      attachments: string[] = [],
      replyTo: string | null = null,
    ): Promise<string | null> => {
      if (!threadId) return 'This conversation is gone.';
      if (!memberId) return 'You are signed out.';

      pendingCount.current += 1;
      const pendingId = `pending:${pendingCount.current}`;
      setLoaded((current) => ({
        ...current,
        messages: [
          ...current.messages,
          {
            id: pendingId,
            threadId,
            authorId: memberId,
            body,
            attachments,
            // The reader's own clock, only for the second this bubble exists.
            createdAt: new Date().toISOString(),
            removedAt: null,
            removedByAdmin: false,
            editedAt: null,
            replyTo,
            notice: null,
            linkPreview: null,
            sharedPostId: null,
            pending: true,
          },
        ],
      }));

      const result = await sendMessage(threadId, memberId, body, attachments, replyTo);
      if (!result.ok) {
        // The undo: a bubble must never stay on screen having never been saved.
        setLoaded((current) => dropMessage(current, pendingId));
        return result.error;
      }
      const saved = result.value;
      // Swap the pending bubble for the saved row, unless the live change
      // already brought that row in.
      setLoaded((current) =>
        current.messages.some((m) => m.id === saved.id)
          ? dropMessage(current, pendingId)
          : upsertMessage(dropMessage(current, pendingId), saved),
      );
      return null;
    },
    [threadId, memberId],
  );

  const edit = useCallback(async (messageId: string, body: string): Promise<string | null> => {
    const result = await editMessage(messageId, body);
    if (!result.ok) return result.error;
    // Not optimistic, unlike sending: the live change brings the database's
    // row; this only stops the old words flashing back first.
    setLoaded((current) => ({
      ...current,
      messages: current.messages.map((message) =>
        message.id === messageId
          ? { ...message, body, editedAt: new Date().toISOString() }
          : message,
      ),
    }));
    return null;
  }, []);

  const remove = useCallback(async (messageId: string): Promise<string | null> => {
    const result = await removeMessage(messageId);
    if (!result.ok) return result.error;
    // The row is blanked by the function; the files go through the storage
    // API, which no SQL can reach — see 20260918200000. Best effort.
    const target = now.current.messages.find((message) => message.id === messageId);
    if (target && target.attachments.length > 0) void deleteAttachments(target.attachments);
    // Not optimistic: the sentence that replaces the body is the database's.
    setLoaded((current) => ({
      ...current,
      messages: current.messages.map((message) =>
        message.id === messageId
          ? { ...message, body: '', attachments: [], removedAt: new Date().toISOString() }
          : message,
      ),
    }));
    return null;
  }, []);

  return {
    thread,
    messages: loaded.messages,
    loading,
    error,
    stale,
    hasEarlier: loaded.earlier,
    loadingEarlier,
    earlierError,
    loadEarlier,
    reveal,
    reload,
    changed,
    send,
    edit,
    remove,
  };
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
  if (error) return { ok: false, error: describeError(error, 'The conversation was not opened.') };
  if (!data) return { ok: false, error: 'The conversation was not opened.' };
  return { ok: true, value: data };
}

/**
 * What the row can be refused for, in the composer's words. The policy is
 * the membership and the thread; the two constraints are the row's own shape.
 * The composer stops the length and the count before sending, so reaching
 * either here means a second tab or an older build got past it.
 */
const MESSAGE_REFUSALS = {
  attempt: 'Your message was not sent.',
  refused: 'You cannot write in this conversation.',
  constraints: {
    chat_messages_check:
      'A message needs some words or a photograph, and at most 4,000 characters.',
    chat_messages_attachments_check: `Up to ${MAX_ATTACHMENTS} photographs on one message.`,
  },
};

/** Say something. The insert policy is what decides; this only asks. */
export async function sendMessage(
  threadId: string,
  authorId: string,
  body: string,
  attachments: string[] = [],
  /** The message this one answers, drawn as a quote, or null. */
  replyTo: string | null = null,
  /** A post from a room to share, drawn as a card (shared-posts.ts). */
  sharedPostId: string | null = null,
): Promise<ChatWriteResult<ChatMessage>> {
  const { data, error } = (await getSupabase()
    .from('chat_messages')
    // Exactly the columns insert is granted on. created_at, removed_at,
    // removed_by_admin and edited_at belong to the database — see
    // 20260918070000 — and naming one here would fail with `permission
    // denied`. reply_to is named only when there is one, so a plain message
    // still lands on a database that predates the column.
    .insert({
      thread_id: threadId,
      author_id: authorId,
      body,
      attachments,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(sharedPostId ? { shared_post_id: sharedPostId } : {}),
    })
    .select(MESSAGE_COLUMNS)
    .single()) as Result<MessageRow>;
  if (error) return { ok: false, error: describeError(error, MESSAGE_REFUSALS) };
  if (!data) return { ok: false, error: 'The message was not sent.' };
  return { ok: true, value: toMessage(data) };
}

/**
 * Change the words of the reader's own message.
 *
 * `chat_edit_message` decides and refuses in a sentence: the author only, and
 * only while the message is standing. The earlier version goes to
 * chat_edits, which an administrator reads on a report of it. A blank body
 * is refused unless the message has photographs, and an edit that changes
 * nothing is refused; the composer stops both before sending.
 */
export async function editMessage(messageId: string, body: string): Promise<ChatWriteResult<null>> {
  const { error } = await getSupabase().rpc('chat_edit_message', {
    message: messageId,
    new_body: body,
  });
  if (error) {
    return {
      ok: false,
      error: describeError(error, {
        attempt: 'Your edit was not saved.',
        refused: 'You can only edit your own message.',
        missing: 'This message is not there any more.',
      }),
    };
  }
  return { ok: true, value: null };
}

/**
 * Remove a message. The author's own, or anybody's if the caller is an
 * administrator — `chat_remove_message` decides and refuses in a sentence.
 */
export async function removeMessage(messageId: string): Promise<ChatWriteResult<null>> {
  const { error } = await getSupabase().rpc('chat_remove_message', { message: messageId });
  if (error) return { ok: false, error: describeError(error, 'The message was not removed.') };
  return { ok: true, value: null };
}
