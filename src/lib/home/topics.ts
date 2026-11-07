import { useEffect, useState } from 'react';
import { AUTHOR_COLUMNS, type ChatAuthorRow, rememberChatAuthors } from '@/lib/chat/authors';
import { POST_COLUMNS, type PostRow, toPost } from '@/lib/chat/topics';
import type { ChatPost, ChatRoom } from '@/lib/chat/types';
import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import type { HomeTopic, HomeTopicSummary } from '@/lib/home/types';
import { useKeptRead } from '@/lib/kept-reads';
import { getSupabase } from '@/lib/supabase';

/**
 * Recent topics across every open room, for Home: one read (two until 2026-10-14), RLS the filter.
 * The newest forty topics, each embedding `opening` and `replies`; embeds obey the same
 * `chat_room_is_readable` policies.
 *
 * `opening` is the earliest post, unfiltered: filtering out a removed question would present
 * its first reply as the question. `replies` are standing top-level posts (`replyTo` null, since
 * 20260930000000), so a card never quotes a side-conversation; two suffice, as a standing opener
 * is the first of them.
 *
 * Closed rooms: administrators can read them, so `toHomeTopics` drops them against the rooms list
 * (as `continue-in-room.tsx` does), or an administrator's Home would look busier than a member's.
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
 * The topics a card can be drawn from, newest activity first. Pure, so the header's rules are
 * tested without a database; a photo topic's opening post has a photograph.
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
  const kept = useKeptRead();

  useEffect(() => {
    // Shown again within the minute, nothing changed (lib/kept-reads.ts).
    if (kept.fresh('home')) return;
    const controller = new AbortController();
    const aborted = () => controller.signal.aborted;
    const landed = kept.start('home');
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
        landed();
      } catch (e) {
        if (aborted()) return;
        fail(describeThrown(e, ATTEMPT));
      }
    }

    void load();
    return () => {
      controller.abort();
    };
  }, [kept]);

  return state;
}
