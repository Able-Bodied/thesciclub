/**
 * The shapes Chat passes around.
 *
 * Separate from `@/types/domain` deliberately: that file is the vocabulary of
 * the club — members, events, invites — and this one is the vocabulary of one
 * feature. Nothing outside src/lib/chat and src/routes/chat should need these.
 */

/**
 * The groupings a discussion room falls into, in the order they are drawn.
 * `chat_rooms.category` is checked against exactly these, and
 * `chat_create_room` refuses anything else by name.
 *
 * Body, Life and Kit are the mock's and hold the seeded twelve. Mind, Family
 * and Places were added on 2026-09-21 once members could start rooms: three
 * headings sized for twelve rooms the club wrote itself were a short list to
 * pick from for a room about grief, about parenting from a chair, or about
 * which airports have a working lift. What each is for is in
 * 20260918180000's header.
 */
export const ROOM_CATEGORIES = ['Body', 'Mind', 'Life', 'Family', 'Kit', 'Places'] as const;
export type RoomCategory = (typeof ROOM_CATEGORIES)[number];

export interface ChatRoom {
  /** A slug — `bowel`, `bladder` — and what is in the URL. */
  id: string;
  name: string;
  description: string;
  category: RoomCategory;
  /**
   * A decorative text glyph, or null for a room a member started.
   *
   * The room's name is always printed beside it, so a null one costs nothing
   * but a letter tile — the same one a null author gets. There is deliberately
   * no icon picker: each seeded glyph had to be checked in a screenshot, and ⛭
   * drew as a tofu box, which is not a problem to hand to somebody who came
   * here to ask about their shoulder.
   */
  icon: string | null;
  sortOrder: number;
  /**
   * When an administrator opened the room, or null while it is closed.
   *
   * A member never sees a closed room at all — the select policy excludes it,
   * so a null here means the reader is an administrator looking at /admin.
   *
   * A room a member started is open from the moment it exists: there is nobody
   * standing by to open it, and it is born with a topic in it.
   */
  openedAt: string | null;
  /**
   * The member who started it, or null for the seeded twelve.
   *
   * Also null once that member has left the club — the room stays and the name
   * goes, like every other thing they wrote. The card says "Started by a former
   * member" rather than dropping the line, because a room with a starter and a
   * room without one are different kinds of room.
   */
  createdBy: string | null;
}

/**
 * The segments across the top of /chat, in the order they are drawn.
 *
 * The mock's, from `chatPage()`. `all` is first and is the default: it is the
 * one that answers "what is there", and the other three are narrowings of it.
 */
export const CHAT_SEGMENTS = ['all', 'direct', 'groups', 'rooms'] as const;
export type ChatSegment = (typeof CHAT_SEGMENTS)[number];

/**
 * Somebody who wrote something, as `chat_authors` projects them.
 *
 * Not a profile: no city, no bio, no age. A member who has turned themselves
 * off the directory is still an author here, which is the whole reason the view
 * exists — see src/lib/chat/authors.ts.
 */
export interface ChatAuthor {
  id: string;
  displayName: string;
  photoPath: string | null;
  photoAlt: string | null;
  avatarColor: string | null;
  /** Exact level where they gave one, the range otherwise. May be absent. */
  level: string | null;
  isAdmin: boolean;
  /** Whether /peers/:id will show them, and therefore whether to link. */
  hasProfile: boolean;
}

/** How many topics, posts and members a room has. Counts only, never who. */
export interface RoomStats {
  topicCount: number;
  postCount: number;
  memberCount: number;
}

/** One topic in a room, as `chat_topics_for` returns it. */
export interface ChatTopic {
  id: string;
  roomId: string;
  title: string;
  /** Null when the member who started it has been removed from the club. */
  authorId: string | null;
  createdAt: string;
  lastPostAt: string;
  replyCount: number;
  /** People who have opened it, not times it has been opened. */
  viewCount: number;
  unread: boolean;
  /** The first four people to post, in the order they first did. */
  participantIds: string[];
}

/**
 * The three orders the topic list can be read in, and the mock's labels.
 *
 * `activity` is first and is the default: a forum is a list of what is being
 * talked about now, and the other two are ways of asking a different question
 * of the same list.
 */
export const ROOM_SORTS = ['activity', 'replies', 'views'] as const;
export type RoomSort = (typeof ROOM_SORTS)[number];

/** One post in a topic. */
export interface ChatPost {
  id: string;
  topicId: string;
  /** Null when the member who wrote it has been removed from the club. */
  authorId: string | null;
  /** Empty once the post is removed — the database blanks the column. */
  body: string;
  createdAt: string;
  removedAt: string | null;
  /** Which sentence the reader gets: by its author, or by an administrator. */
  removedByAdmin: boolean;
}

/**
 * The two kinds of thread, which share a table and a screen.
 *
 * A direct thread is a pair and is named by whoever you are talking to; a group
 * has a name somebody chose. `chat_threads.kind` is checked against exactly
 * these. Groups are written in Phase 5 — nothing in this build creates one —
 * and are carried here because the list and the thread screen draw both.
 */
export const THREAD_KINDS = ['direct', 'group'] as const;
export type ThreadKind = (typeof THREAD_KINDS)[number];

/**
 * One conversation as the list sees it, from `chat_my_threads`.
 *
 * It carries its last message rather than the client fetching one per row: the
 * list is a phone screen on hospital wifi, and four queries a row is how a
 * conversation list becomes a loading screen.
 */
export interface ChatThread {
  id: string;
  kind: ThreadKind;
  /** Groups only. A direct thread is named by the other member. */
  name: string | null;
  /** The event a group chat belongs to, where it has one. */
  eventId: string | null;
  createdAt: string;
  lastMessageAt: string;
  memberCount: number;
  /**
   * The other member of a direct thread.
   *
   * Null for a group, and null for a direct thread whose other half has left
   * the club — the roster row goes with the member, so the absence is the fact
   * and the screen draws "Former member".
   */
  otherMemberId: string | null;
  /** Null when nothing has been said yet; blank when the last one was removed. */
  lastBody: string | null;
  lastAuthorId: string | null;
  lastAt: string | null;
  lastRemoved: boolean;
  /** Somebody else's words, newer than you last looked. Not "last_at moved". */
  unread: boolean;
}

/** One message in a thread. */
export interface ChatMessage {
  id: string;
  threadId: string;
  /** Null when the member who wrote it has been removed from the club. */
  authorId: string | null;
  /** Empty once the message is removed — the database blanks the column. */
  body: string;
  createdAt: string;
  removedAt: string | null;
  removedByAdmin: boolean;
  /**
   * True while this is a bubble the reader has sent and the database has not
   * confirmed. Never set on a row that came back from a read.
   */
  pending?: boolean;
}

/**
 * One report, as `admin_chat_reports` returns it.
 *
 * Only an administrator ever holds one of these. A member's own reports are
 * three ids and nothing else — see `useMyReports` — because the snapshot is
 * somebody else's words held outside the conversation they were said in, and
 * one copy of those on the reporter's screen is enough.
 *
 * There is no thread id here and there must never be one. A post carries
 * `topicId` and `roomId` because a room is readable by every member including
 * an administrator; a message carries no way back at all, which is what makes
 * "private even from administrators" still true after somebody reports one.
 */
export interface ChatReport {
  id: string;
  kind: 'post' | 'message';
  /**
   * Where it was said. Recorded when the report was filed, so it is still
   * known once the original is gone. The panel offers Remove for a room or a
   * group and not for a direct conversation — see reports-section.tsx.
   */
  contextKind: 'room' | 'group' | 'direct';
  /** Null once the reported row itself is gone. The snapshot outlives it. */
  postId: string | null;
  messageId: string | null;
  /** What the reporter saw, copied when they reported it. */
  bodySnapshot: string;
  /** When it was written, which is rarely when it was reported. */
  writtenAt: string;
  /** "Bowel management › …", a group's name, or "A direct conversation". */
  place: string;
  topicId: string | null;
  roomId: string | null;
  note: string | null;
  createdAt: string;
  /** Null for somebody who has since been removed from the club. */
  reporterId: string | null;
  reporterName: string | null;
  reportedAuthorId: string | null;
  reportedAuthorName: string | null;
  /** How many members reported this same post or message. Never fewer than 1. */
  reportCount: number;
  /** Whether the post or message has since been taken down, or deleted. */
  alreadyRemoved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolution: string | null;
}
