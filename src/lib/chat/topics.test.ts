import { describe, expect, it } from 'vitest';
import { firstUnreadIndex, firstUnreadThread, sortTopics, threadPosts } from '@/lib/chat/topics';
import type { ChatPost, ChatTopic } from '@/lib/chat/types';

/**
 * The pure half of topics.ts. Nothing here touches supabase, so nothing here
 * is mocked — the hooks in the same file are exercised by the screens.
 */

const topic = (o: Partial<ChatTopic> & { id: string }): ChatTopic => ({
  roomId: 'bowel',
  title: 'A question',
  authorId: 'a',
  createdAt: '2026-09-01T10:00:00Z',
  lastPostAt: '2026-09-01T10:00:00Z',
  replyCount: 0,
  viewCount: 0,
  unread: false,
  participantIds: ['a'],
  ...o,
});

const post = (o: Partial<ChatPost> & { id: string }): ChatPost => ({
  topicId: 't',
  authorId: 'a',
  body: 'Something.',
  createdAt: '2026-09-01T10:00:00Z',
  removedAt: null,
  attachments: [],
  removedByAdmin: false,
  editedAt: null,
  replyTo: null,
  ...o,
});

describe('sortTopics', () => {
  const topics = [
    topic({ id: 'old', lastPostAt: '2026-09-01T10:00:00Z', replyCount: 9, viewCount: 2 }),
    topic({ id: 'busy', lastPostAt: '2026-09-05T10:00:00Z', replyCount: 4, viewCount: 30 }),
    topic({ id: 'fresh', lastPostAt: '2026-09-09T10:00:00Z', replyCount: 1, viewCount: 1 }),
  ];

  it('puts the most recently active first by default', () => {
    expect(sortTopics(topics, 'activity').map((t) => t.id)).toEqual(['fresh', 'busy', 'old']);
  });

  it('sorts by replies, most first', () => {
    expect(sortTopics(topics, 'replies').map((t) => t.id)).toEqual(['old', 'busy', 'fresh']);
  });

  it('sorts by views, most first', () => {
    expect(sortTopics(topics, 'views').map((t) => t.id)).toEqual(['busy', 'old', 'fresh']);
  });

  // In a club this size most topics have the same small number of replies. A
  // list that reorders its ties on every read is a list you lose your place in.
  it('breaks a tie by activity, so the order is stable', () => {
    const tied = [
      topic({ id: 'a', replyCount: 2, lastPostAt: '2026-09-01T10:00:00Z' }),
      topic({ id: 'b', replyCount: 2, lastPostAt: '2026-09-08T10:00:00Z' }),
    ];
    expect(sortTopics(tied, 'replies').map((t) => t.id)).toEqual(['b', 'a']);
    expect(sortTopics([...tied].reverse(), 'replies').map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('leaves the list it was given alone', () => {
    const given = [...topics];
    sortTopics(given, 'views');
    expect(given.map((t) => t.id)).toEqual(['old', 'busy', 'fresh']);
  });
});

describe('firstUnreadIndex', () => {
  const posts = [
    post({ id: '1', createdAt: '2026-09-01T10:00:00Z' }),
    post({ id: '2', createdAt: '2026-09-02T10:00:00Z' }),
    post({ id: '3', createdAt: '2026-09-03T10:00:00Z' }),
  ];

  // Not "first unread is the first post, so scroll past the question". Somebody
  // arriving for the first time starts at the top.
  it('starts at the top for a reader who has never opened it', () => {
    expect(firstUnreadIndex(posts, null)).toBe(0);
  });

  it('finds the first post written since the reader last looked', () => {
    expect(firstUnreadIndex(posts, '2026-09-01T12:00:00Z')).toBe(1);
    expect(firstUnreadIndex(posts, '2026-09-02T12:00:00Z')).toBe(2);
  });

  it('stays at the top when there is nothing new', () => {
    expect(firstUnreadIndex(posts, '2026-09-09T10:00:00Z')).toBe(0);
  });

  it('copes with a topic whose posts have all been read to the second', () => {
    expect(firstUnreadIndex(posts, '2026-09-03T10:00:00Z')).toBe(0);
  });

  it('copes with an empty topic', () => {
    expect(firstUnreadIndex([], '2026-09-01T10:00:00Z')).toBe(0);
  });
});

describe('threadPosts', () => {
  const opener = post({ id: 'q', createdAt: '2026-09-01T10:00:00Z' });
  const answer = post({ id: 'a1', createdAt: '2026-09-01T11:00:00Z' });
  const later = post({ id: 'a2', createdAt: '2026-09-01T13:00:00Z' });
  const underQ = post({ id: 'r1', replyTo: 'q', createdAt: '2026-09-01T12:00:00Z' });
  const underA1 = post({ id: 'r2', replyTo: 'a1', createdAt: '2026-09-01T14:00:00Z' });

  it('files each reply under its post, top-level posts and replies both in time order', () => {
    const threads = threadPosts([underA1, later, underQ, answer, opener]);
    expect(threads.map((t) => [t.post.id, t.replies.map((r) => r.id)])).toEqual([
      ['q', ['r1']],
      ['a1', ['r2']],
      ['a2', []],
    ]);
  });

  // The screen leaves removed posts out, so a reply's parent may not be in
  // the list; and the database nulls replyTo on removal, so a read a moment
  // later says the same thing. Either way the reply stands on its own.
  it('stands a reply whose post is not there as a post of its own', () => {
    const threads = threadPosts([underQ, answer]);
    expect(threads.map((t) => t.post.id)).toEqual(['a1', 'r1']);
    expect(threads.every((t) => t.replies.length === 0)).toBe(true);
  });

  it('files a reply to a reply under the same post, one level deep', () => {
    const deeper = post({ id: 'r3', replyTo: 'r2', createdAt: '2026-09-01T15:00:00Z' });
    const threads = threadPosts([opener, answer, underA1, deeper]);
    expect(threads.map((t) => [t.post.id, t.replies.map((r) => r.id)])).toEqual([
      ['q', []],
      ['a1', ['r2', 'r3']],
    ]);
  });

  it('leaves the list it was given alone', () => {
    const given = [later, opener];
    threadPosts(given);
    expect(given.map((p) => p.id)).toEqual(['a2', 'q']);
  });
});

describe('firstUnreadThread', () => {
  const threads = threadPosts([
    post({ id: 'q', createdAt: '2026-09-01T10:00:00Z' }),
    post({ id: 'r1', replyTo: 'q', createdAt: '2026-09-03T10:00:00Z' }),
    post({ id: 'a1', createdAt: '2026-09-02T10:00:00Z' }),
  ]);

  it('starts at the top for a reader who has never opened it', () => {
    expect(firstUnreadThread(threads, null)).toBe(0);
  });

  // A new reply under the question is new even though the question is not.
  it('opens at the post a new reply sits under', () => {
    expect(firstUnreadThread(threads, '2026-09-02T12:00:00Z')).toBe(0);
    expect(firstUnreadThread(threads, '2026-09-01T12:00:00Z')).toBe(0);
  });

  it('opens at the first new top-level post when nothing under earlier ones is new', () => {
    const flat = threadPosts([
      post({ id: 'q', createdAt: '2026-09-01T10:00:00Z' }),
      post({ id: 'a1', createdAt: '2026-09-02T10:00:00Z' }),
    ]);
    expect(firstUnreadThread(flat, '2026-09-01T12:00:00Z')).toBe(1);
  });

  it('stays at the top when there is nothing new', () => {
    expect(firstUnreadThread(threads, '2026-09-09T10:00:00Z')).toBe(0);
  });
});
