import { useEffect, useState } from 'react';
import { POST_COLUMNS, type PostRow, toPost } from '@/lib/chat/topics';
import type { ChatPost, ChatRoom } from '@/lib/chat/types';
import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import type { HomeTopic, HomeTopicSummary } from '@/lib/home/types';
import { getSupabase } from '@/lib/supabase';

/**
 * Recent topics across every open room, for Home.
 *
 * ---------------------------------------------------------------------------
 * Two reads, joined here, and RLS is the filter
 * ---------------------------------------------------------------------------
 * The newest forty topics by activity, then every post in those forty. Both
 * tables are already granted to `authenticated` and their select policies are
 * `chat_room_is_readable`, so what comes back is exactly what this member may
 * read. Nothing here decides visibility except the one thing RLS cannot: see
 * "closed rooms" below.
 *
 * Removed posts are read on purpose. The opening post is the earliest row for
 * a topic, standing or not. Filter the removed ones out in the query and a
 * topic whose question was taken down would present its first reply as the
 * question.
 *
 * ---------------------------------------------------------------------------
 * When this should become one SQL function
 * ---------------------------------------------------------------------------
 * The posts read is capped at 1,000 rows, and it reads every post in forty
 * topics to use two from each. That is fine for a club this size. When the cap
 * is reached, `console.warn` says so once, and that is the sign to move this
 * into one `security invoker` function (so RLS still applies) that returns
 * each topic with its opening post and first reply. Not built yet, because
 * nothing needs it yet.
 *
 * ---------------------------------------------------------------------------
 * Closed rooms
 * ---------------------------------------------------------------------------
 * An administrator can read a closed room, so their read includes topics no
 * member can see. `toHomeTopics` drops them, against the rooms list, exactly as
 * `continue-in-room.tsx` does. Without it an administrator's Home is fuller
 * than any member's, and a screenshot taken as the administrator says the club
 * is busier than it is.
 */

export const HOME_TOPIC_LIMIT = 40;
export const HOME_POST_LIMIT = 1000;

const TOPIC_COLUMNS = 'id, room_id, title, author_id, created_at, last_post_at, reply_count';

interface TopicRow {
  id: string;
  room_id: string;
  title: string;
  author_id: string | null;
  created_at: string;
  last_post_at: string;
  reply_count: number;
}

function toSummary(row: TopicRow): HomeTopicSummary {
  return {
    id: row.id,
    roomId: row.room_id,
    title: row.title,
    authorId: row.author_id,
    createdAt: row.created_at,
    lastPostAt: row.last_post_at,
    replyCount: row.reply_count,
  };
}

interface Result<T> {
  data: T | null;
  error: Failure | null;
}

/** Earliest first, with the id to break a tie so two reads agree. */
function byPostTime(a: ChatPost, b: ChatPost): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

/**
 * The topics a card can be drawn from, newest activity first.
 *
 * Pure, so the rules that matter are tested without a database: a topic in a
 * room that is not open is dropped; the opening post is the earliest row even
 * when it has been removed; the first reply is the earliest standing post
 * after it; and a photo topic is one whose opening post has a photograph.
 */
export function toHomeTopics(
  topics: readonly HomeTopicSummary[],
  posts: readonly ChatPost[],
  rooms: readonly ChatRoom[],
): HomeTopic[] {
  const open = new Map(
    rooms.filter((room) => room.openedAt !== null).map((room) => [room.id, room]),
  );

  const byTopic = new Map<string, ChatPost[]>();
  for (const post of posts) {
    const list = byTopic.get(post.topicId);
    if (list) list.push(post);
    else byTopic.set(post.topicId, [post]);
  }

  return [...topics]
    .sort((a, b) => b.lastPostAt.localeCompare(a.lastPostAt) || a.id.localeCompare(b.id))
    .flatMap((topic) => {
      const room = open.get(topic.roomId);
      if (!room) return [];
      const list = [...(byTopic.get(topic.id) ?? [])].sort(byPostTime);
      const first = list[0];
      const opening = first?.removedAt === null ? first : null;
      const firstReply = list.slice(1).find((post) => post.removedAt === null) ?? null;
      return [
        {
          ...topic,
          room,
          opening,
          firstReply,
          photo: opening !== null && opening.attachments.length > 0,
        },
      ];
    });
}

export interface HomeTopicsState {
  topics: HomeTopicSummary[];
  /** Every post in those topics, removed ones included. See the header. */
  posts: ChatPost[];
  loading: boolean;
  error: string | null;
}

const ATTEMPT = 'Could not load the topics.';

/**
 * Read once, on arrival. Home does not subscribe to changes; the page's header
 * says why.
 */
export function useHomeTopics(): HomeTopicsState {
  const [state, setState] = useState<HomeTopicsState>({
    topics: [],
    posts: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    const aborted = () => controller.signal.aborted;
    const fail = (error: string) => {
      setState({ topics: [], posts: [], loading: false, error });
    };

    async function load() {
      try {
        const supabase = getSupabase();
        const topicRows = (await supabase
          .from('chat_topics')
          .select(TOPIC_COLUMNS)
          .order('last_post_at', { ascending: false })
          .limit(HOME_TOPIC_LIMIT)
          .abortSignal(controller.signal)) as Result<TopicRow[]>;
        if (aborted()) return;
        if (topicRows.error) {
          fail(describeError(topicRows.error, ATTEMPT));
          return;
        }
        const topics = (topicRows.data ?? []).map(toSummary);
        if (topics.length === 0) {
          setState({ topics, posts: [], loading: false, error: null });
          return;
        }

        const postRows = (await supabase
          .from('chat_posts')
          .select(POST_COLUMNS)
          .in(
            'topic_id',
            topics.map((topic) => topic.id),
          )
          .order('created_at')
          .order('id')
          .limit(HOME_POST_LIMIT)
          .abortSignal(controller.signal)) as Result<PostRow[]>;
        if (aborted()) return;
        if (postRows.error) {
          fail(describeError(postRows.error, ATTEMPT));
          return;
        }
        const posts = (postRows.data ?? []).map(toPost);
        if (posts.length === HOME_POST_LIMIT) {
          console.warn(
            `Home read ${HOME_POST_LIMIT} posts, the cap. Some topics may be missing their first reply; see src/lib/home/topics.ts.`,
          );
        }
        setState({ topics, posts, loading: false, error: null });
      } catch (e) {
        if (aborted()) return;
        fail(describeThrown(e, ATTEMPT));
      }
    }

    void load();
    return () => {
      controller.abort();
    };
  }, []);

  return state;
}
