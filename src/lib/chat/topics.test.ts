import { describe, expect, it } from 'vitest';
import { firstUnreadIndex, sortTopics } from '@/lib/chat/topics';
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
  removedByAdmin: false,
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
