import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from '@/lib/account';
import { MAX_ATTACHMENTS } from '@/lib/chat/attachments';
import type { ChatPost, ChatTopic, RoomSort } from '@/lib/chat/types';
import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Topics and posts: the forum half of Chat.
 *
 * ---------------------------------------------------------------------------
 * The topic list comes from a function, not a table
 * ---------------------------------------------------------------------------
 * `chat_topics_for(room)` is `security definer` and returns the view count and
 * the unread flag alongside each topic. Both are counted from
 * `chat_topic_reads`, which a member may only read their own rows of, so no
 * arrangement of client-side queries could produce them. It also does the
 * room-visibility check itself, which is why a closed room comes back as an
 * empty list rather than as an error.
 *
 * ---------------------------------------------------------------------------
 * Reading and writing are separate paths on purpose
 * ---------------------------------------------------------------------------
 * Posts are read straight from `chat_posts` and written straight to it; only
 * the things that touch somebody else's rows — the counts, marking read,
 * removing — go through a function. A removed post comes back with an empty
 * body because the database blanked the column, so there is no client-side
 * rule about what to show and no way for the text to arrive and be hidden.
 */

/**
 * What a supabase call hands back, named so that the rpc results can be cast
 * to it. `rpc()` is untyped without generated database types, and an untyped
 * result spreads `any` through every line that touches it — which is exactly
 * the kind of value the strict lint rules here exist to stop.
 */
interface Result<T> {
  data: T | null;
  error: Failure | null;
}

interface TopicRow {
  id: string;
  room_id: string;
  title: string;
  author_id: string | null;
  created_at: string;
  last_post_at: string;
  reply_count: number;
  view_count: number | string;
  unread: boolean;
  participant_ids: string[] | null;
}

function toTopic(row: TopicRow): ChatTopic {
  return {
    id: row.id,
    roomId: row.room_id,
    title: row.title,
    authorId: row.author_id,
    createdAt: row.created_at,
    lastPostAt: row.last_post_at,
    replyCount: row.reply_count,
    // bigint: a string once it passes 2^53, a number before that.
    viewCount: Number(row.view_count),
    unread: row.unread,
    participantIds: row.participant_ids ?? [],
  };
}

interface PostRow {
  id: string;
  topic_id: string;
  author_id: string | null;
  body: string;
  attachments: string[] | null;
  created_at: string;
  removed_at: string | null;
  removed_by_admin: boolean;
}

const POST_COLUMNS =
  'id, topic_id, author_id, body, attachments, created_at, removed_at, removed_by_admin';

function toPost(row: PostRow): ChatPost {
  return {
    id: row.id,
    topicId: row.topic_id,
    authorId: row.author_id,
    body: row.body,
    attachments: row.attachments ?? [],
    createdAt: row.created_at,
    removedAt: row.removed_at,
    removedByAdmin: row.removed_by_admin,
  };
}

/**
 * The topic list in one of its three orders.
 *
 * Pure, so the sort bar is tested without a database. Every order falls back to
 * activity, because ties are the ordinary case in a club this size — a room
 * where nine topics have one reply each would otherwise shuffle itself on every
 * read, and a list that reorders while you look at it is a list you lose your
 * place in.
 */
export function sortTopics(topics: ChatTopic[], sort: RoomSort): ChatTopic[] {
  const byActivity = (a: ChatTopic, b: ChatTopic) => b.lastPostAt.localeCompare(a.lastPostAt);
  return [...topics].sort((a, b) => {
    if (sort === 'replies' && a.replyCount !== b.replyCount) return b.replyCount - a.replyCount;
    if (sort === 'views' && a.viewCount !== b.viewCount) return b.viewCount - a.viewCount;
    return byActivity(a, b);
  });
}

/**
 * Where to open a topic: the first post the reader has not seen, or the top.
 *
 * Returns an index into `posts`, or 0 when everything is new or nothing is.
 * A reader arriving at a topic for the first time starts at the beginning —
 * "first unread" for somebody who has read none of it is the first post, which
 * is the top, and jumping them past the question would be absurd.
 */
export function firstUnreadIndex(posts: ChatPost[], lastReadAt: string | null): number {
  if (!lastReadAt) return 0;
  const index = posts.findIndex((post) => post.createdAt > lastReadAt);
  return index === -1 ? 0 : index;
}

export interface RoomTopicsState {
  topics: ChatTopic[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useRoomTopics(roomId: string | undefined): RoomTopicsState {
  const [topics, setTopics] = useState<ChatTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!roomId) {
      setTopics([]);
      setLoading(false);
      return;
    }
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const aborted = () => controller.signal.aborted;

    try {
      const { data, error: failure } = (await getSupabase()
        .rpc('chat_topics_for', { room: roomId })
        .abortSignal(controller.signal)) as Result<TopicRow[]>;
      if (aborted()) return;
      if (failure) {
        setTopics([]);
        setError(describeError(failure, 'Could not load the topics.'));
        setLoading(false);
        return;
      }
      setTopics((data ?? []).map(toTopic));
      setError(null);
      setLoading(false);
    } catch (e) {
      if (aborted()) return;
      setTopics([]);
      setError(describeThrown(e, 'Could not load the topics.'));
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void load();
    return () => {
      inFlight.current?.abort();
    };
  }, [load]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return { topics, loading, error, reload };
}

export interface TopicPostsState {
  /** The topic itself, or null while loading or when it cannot be read. */
  topic: ChatTopic | null;
  posts: ChatPost[];
  /** The reader's own last_read_at, as it was *before* this visit marked it. */
  lastReadAt: string | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * One topic and its posts.
 *
 * Three reads rather than one, and each is a different question:
 *
 *  - `chat_topics_for(room)`, filtered down to this topic, for the title, the
 *    reply count and the view count. The view count only exists inside that
 *    function.
 *  - `chat_posts`, for the posts.
 *  - the reader's own `chat_topic_reads` row, read *before* it is overwritten,
 *    so the screen knows where the reader had got to.
 *
 * Then it marks the topic read. Marking is a function and sets the server's
 * clock, so nothing here sends a timestamp.
 */
export function useTopicPosts(
  roomId: string | undefined,
  topicId: string | undefined,
): TopicPostsState {
  const account = useAccount();
  const memberId = account.status === 'member' ? account.userId : null;

  const [topic, setTopic] = useState<ChatTopic | null>(null);
  const [posts, setPosts] = useState<ChatPost[]>([]);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!roomId || !topicId) {
      setLoading(false);
      return;
    }
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const aborted = () => controller.signal.aborted;
    const supabase = getSupabase();

    try {
      const [topics, postRows, reads] = (await Promise.all([
        supabase.rpc('chat_topics_for', { room: roomId }).abortSignal(controller.signal),
        supabase
          .from('chat_posts')
          .select(POST_COLUMNS)
          .eq('topic_id', topicId)
          .order('created_at')
          .abortSignal(controller.signal),
        memberId
          ? supabase
              .from('chat_topic_reads')
              .select('last_read_at')
              .eq('topic_id', topicId)
              .eq('member_id', memberId)
              // Before maybeSingle(), not after: that one returns a promise
              // rather than the builder, so the signal has nowhere to go.
              .abortSignal(controller.signal)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])) as [Result<TopicRow[]>, Result<PostRow[]>, Result<{ last_read_at: string }>];
      if (aborted()) return;

      const failure = topics.error ?? postRows.error;
      if (failure) {
        setError(describeError(failure, 'Could not load the topic.'));
        setLoading(false);
        return;
      }

      const found = (topics.data ?? []).find((row) => row.id === topicId) ?? null;
      // The counts were read a moment before this visit was recorded, so a
      // first-time reader would be looking at a topic that says "0 views".
      // Marking read below inserts exactly one row when there was none, so
      // adding one here is the count after this visit rather than a guess.
      const seenBefore = reads.data !== null;
      setTopic(
        found
          ? { ...toTopic(found), viewCount: Number(found.view_count) + (seenBefore ? 0 : 1) }
          : null,
      );
      setPosts((postRows.data ?? []).map(toPost));
      setLastReadAt(reads.data?.last_read_at ?? null);
      setError(null);
      setLoading(false);

      // After the read, not before: the value above is where the reader had
      // got to, and this is the visit that moves it. A failure here is silent —
      // the topic is on screen and unread is a convenience.
      if (found) void supabase.rpc('chat_mark_topic_read', { topic: topicId });
    } catch (e) {
      if (aborted()) return;
      setError(describeThrown(e, 'Could not load the topic.'));
      setLoading(false);
    }
  }, [roomId, topicId, memberId]);

  useEffect(() => {
    void load();
    return () => {
      inFlight.current?.abort();
    };
  }, [load]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return { topic, posts, lastReadAt, loading, error, reload };
}

export type ChatWriteResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Start a topic: the title and the first post, in one transaction.
 *
 * Returns the new topic's id so the caller can go straight to it, which is also
 * what marks it read — see the unread note in 20260918050000.
 */
export async function createTopic(
  roomId: string,
  title: string,
  body: string,
  attachments: string[] = [],
): Promise<ChatWriteResult<string>> {
  const { data, error } = (await getSupabase().rpc('chat_create_topic', {
    room: roomId,
    title,
    body,
    attachments,
  })) as Result<string>;
  if (error) {
    return {
      ok: false,
      error: describeError(error, {
        attempt: 'The topic was not created.',
        constraints: {
          chat_topics_title_check: 'A title is up to 140 characters.',
          chat_posts_check:
            'A topic needs some words or a photograph, and at most 4,000 characters.',
          chat_posts_attachments_check: `Up to ${MAX_ATTACHMENTS} photographs on one post.`,
        },
      }),
    };
  }
  if (!data) return { ok: false, error: 'The topic was not created.' };
  return { ok: true, value: data };
}

/**
 * What the row can be refused for, in the composer's words. The policy is
 * the membership, the room and whether the topic is still open; the two
 * constraints are the row's own shape, which the composer already stops.
 */
const POST_REFUSALS = {
  attempt: 'Your reply was not posted.',
  refused: 'You cannot post in this room.',
  constraints: {
    chat_posts_check: 'A reply needs some words or a photograph, and at most 4,000 characters.',
    chat_posts_attachments_check: `Up to ${MAX_ATTACHMENTS} photographs on one post.`,
  },
};

/** Post a reply. The insert policy is what decides; this only asks. */
export async function sendPost(
  topicId: string,
  authorId: string,
  body: string,
  attachments: string[] = [],
): Promise<ChatWriteResult<ChatPost>> {
  const { data, error } = (await getSupabase()
    .from('chat_posts')
    .insert({ topic_id: topicId, author_id: authorId, body, attachments })
    .select(POST_COLUMNS)
    .single()) as Result<PostRow>;
  if (error) return { ok: false, error: describeError(error, POST_REFUSALS) };
  if (!data) return { ok: false, error: 'The post was not saved.' };
  return { ok: true, value: toPost(data) };
}

/**
 * Remove a post. The author's own, or anybody's if the caller is an
 * administrator — `chat_remove_post` decides and refuses in a sentence.
 */
export async function removePost(postId: string): Promise<ChatWriteResult<null>> {
  const { error } = await getSupabase().rpc('chat_remove_post', { post: postId });
  if (error) return { ok: false, error: describeError(error, 'The post was not removed.') };
  return { ok: true, value: null };
}
