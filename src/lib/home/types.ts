import type { ChatPost, ChatRoom } from '@/lib/chat/types';
import type { BrowseMember, ClubEvent } from '@/types/domain';

/**
 * The shapes Home passes around.
 *
 * Home adds no new kind of content (the owner's decision, 2026-09-29). A
 * question asked from Home is a topic in a room, a photograph is a topic
 * whose first post has one, and the rest are
 * events and members that already exist. So everything here is a view of a
 * type Chat, Events or Peers already owns, and nothing here is stored.
 */

/**
 * The pills across the top of Home, in the order they are drawn.
 *
 * Not the mock's "Questions" and "Posts": a topic is not always a question,
 * and "post" already means a reply in a topic. `everything` is first and is
 * the default, so it carries no parameter in the URL.
 */
export const HOME_SEGMENTS = ['everything', 'topics', 'photos', 'events', 'people'] as const;
export type HomeSegment = (typeof HOME_SEGMENTS)[number];

/**
 * A topic as Home reads it, straight from `chat_topics`.
 *
 * No view count and no unread flag. Those exist only inside `chat_topics_for`,
 * which answers for one room at a time, and Home is every open room at once.
 */
export interface HomeTopicSummary {
  id: string;
  roomId: string;
  title: string;
  /** Null when the member who started it has been removed from the club. */
  authorId: string | null;
  createdAt: string;
  lastPostAt: string;
  /** Standing replies only. A removed one stops counting (20260927030000). */
  replyCount: number;
  /** Asked as a question (20261010010000), and drawn larger on Home. */
  isQuestion: boolean;
}

/** One topic, with what a card needs to draw it. */
export interface HomeTopic extends HomeTopicSummary {
  /** Always an open room. A topic in a closed room never becomes one of these. */
  room: ChatRoom;
  /**
   * The topic's first post, or null when that post has been removed.
   *
   * Null is not "load the next one instead". The first standing post after a
   * removed opening is somebody's reply, and drawing it as the question would
   * put words in the asker's mouth. The card draws the title alone.
   */
  opening: ChatPost | null;
  /** The earliest standing post after the opening one, if anybody has replied. */
  firstReply: ChatPost | null;
  /** The opening post carries at least one photograph. */
  photo: boolean;
}

/**
 * One entry in the list, keyed so that no item is drawn twice.
 *
 * A plain topic and a photo topic share `topic:<id>`: they are one topic
 * drawn two ways, and the key is the topic's.
 */
export type FeedItem =
  | { kind: 'topic'; key: string; topic: HomeTopic }
  | { kind: 'photo'; key: string; topic: HomeTopic }
  | { kind: 'event'; key: string; event: ClubEvent }
  | { kind: 'person'; key: string; member: BrowseMember };
