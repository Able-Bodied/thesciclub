import { useEffect, useState } from 'react';
import { AUTHOR_COLUMNS, type ChatAuthorRow, rememberChatAuthors } from '@/lib/chat/authors';
import { POST_COLUMNS, type PostRow, toPost } from '@/lib/chat/topics';
import type { ChatPost, ChatRoom } from '@/lib/chat/types';
import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import type { HomeTopic, HomeTopicSummary } from '@/lib/home/types';
import { getSupabase } from '@/lib/supabase';

/**
 * Recent topics across every open room, for Home.
 *
 * ---------------------------------------------------------------------------
 * One read, and RLS is the filter
 * ---------------------------------------------------------------------------
 * The newest forty topics by activity, each with the posts its card needs,
 * embedded: `opening`, the topic's earliest post, and `replies`, its two
 * earliest standing top-level posts. Both tables are already granted to
 * `authenticated` and their select policies are `chat_room_is_readable`, and
 * an embedded read is held to the same policies, so what comes back is
 * exactly what this member may read. Nothing here decides visibility except
 * the one thing RLS cannot: see "closed rooms" below.
 *
 * Until 2026-10-14 this was two reads, the topics and then every post in
 * them (up to 1,000 rows, to use two from each): a second round trip before
 * Home could draw, and most of its bytes.
 *
 * The opening post is the earliest row for a topic, standing or not, which
 * is why it is embedded on its own and unfiltered. Filter the removed ones
 * out and a topic whose question was taken down would present its first
 * reply as the question.
 *
 * The first reply on a card is the earliest standing post after the opener
 * that answers the topic and not another post — `replyTo` null. Since
 * 20260930000000 a post can sit under another (a reply to an answer); those
 * belong to the answer they are under, and a card that quoted one would put
 * half a side-conversation under the title. Two such posts are enough: when
 * the opener stands it is the first of them (an opener answers nobody), and
 * the reply is the second.
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

const TOPIC_COLUMNS =
  'id, room_id, title, author_id, created_at, last_post_at, reply_count, is_question';

interface TopicRow {
  id: string;
  room_id: string;
  title: string;
  author_id: string | null;
  created_at: string;
  last_post_at: string;
  reply_count: number;
  /** Absent from a database before 20261010010000. */
  is_question?: boolean;
  opening?: PostRow[] | null;
  replies?: (PostRow & { author?: ChatAuthorRow | null })[] | null;
  author?: ChatAuthorRow | null;
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
    isQuestion: row.is_question === true,
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
 * when it has been removed; the first reply is the earliest standing
 * top-level post after it; and a photo topic is one whose opening post has a
 * photograph.
 */
export function toHomeTopics(
  topics: readonly HomeTopicSummary[],
  posts: readonly ChatPost[],
  rooms: readonly ChatRoom[],
): HomeTopic[] {
  const open = new Map(
    rooms
      .filter((room) => room.openedAt !== null && room.showInHome)
      .map((room) => [room.id, room]),
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
      const firstReply =
        list.slice(1).find((post) => post.removedAt === null && post.replyTo === null) ?? null;
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
  /** The posts each card needs, a removed opener included. See the header. */
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
          .select(
            `${TOPIC_COLUMNS}, author:chat_authors!chat_topics_author_id_fkey(${AUTHOR_COLUMNS}), chat_rooms!inner(show_in_home, opened_at), opening:chat_posts(${POST_COLUMNS}), replies:chat_posts(${POST_COLUMNS}, author:chat_authors!chat_posts_author_id_fkey(${AUTHOR_COLUMNS}))`,
          )
          .eq('chat_rooms.show_in_home', true)
          .not('chat_rooms.opened_at', 'is', null)
          .order('last_post_at', { ascending: false })
          .limit(HOME_TOPIC_LIMIT)
          .order('created_at', { referencedTable: 'opening' })
          .order('id', { referencedTable: 'opening' })
          .limit(1, { referencedTable: 'opening' })
          .is('replies.removed_at', null)
          .is('replies.reply_to', null)
          .order('created_at', { referencedTable: 'replies' })
          .order('id', { referencedTable: 'replies' })
          .limit(2, { referencedTable: 'replies' })
          .abortSignal(controller.signal)) as Result<TopicRow[]>;
        if (aborted()) return;
        if (topicRows.error) {
          fail(describeError(topicRows.error, ATTEMPT));
          return;
        }
        const rows = topicRows.data ?? [];
        const topics = rows.map(toSummary);
        // The opener can be in both lists; once each.
        const byId = new Map<string, ChatPost>();
        for (const row of rows) {
          for (const post of [...(row.opening ?? []), ...(row.replies ?? [])]) {
            byId.set(post.id, toPost(post));
          }
        }
        const posts = [...byId.values()];
        // The cards' names and faces came with the topics: no second read.
        rememberChatAuthors(
          rows
            .flatMap((row) => [row.author, ...(row.replies ?? []).map((reply) => reply.author)])
            .filter((author): author is ChatAuthorRow => Boolean(author)),
        );
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
