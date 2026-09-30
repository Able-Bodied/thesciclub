import { describe, expect, it } from 'vitest';
import { toHomeTopics } from '@/lib/home/topics';
import type { HomeTopicSummary } from '@/lib/home/types';
import { makePost, makeRoom } from '@/test/factory';

/**
 * The pure half of home/topics.ts: the join that decides what a card says.
 * The hook's two reads are exercised by the screen test, stubbed.
 */

const summary = (o: Partial<HomeTopicSummary> & { id: string }): HomeTopicSummary => ({
  roomId: 'bowel',
  title: 'A question',
  authorId: 'a',
  createdAt: '2026-09-20T10:00:00Z',
  lastPostAt: '2026-09-20T10:00:00Z',
  replyCount: 0,
  ...o,
});

const bowel = makeRoom();

describe('toHomeTopics', () => {
  it('is empty for empty inputs', () => {
    expect(toHomeTopics([], [], [])).toEqual([]);
    expect(toHomeTopics([summary({ id: 't' })], [], [])).toEqual([]);
  });

  it('takes the earliest post as the opening and the next standing one as the first reply', () => {
    const [topic] = toHomeTopics(
      [summary({ id: 't', replyCount: 2 })],
      [
        makePost({ id: 'reply-2', topicId: 't', createdAt: '2026-09-20T12:00:00Z' }),
        makePost({ id: 'opening', topicId: 't', createdAt: '2026-09-20T10:00:00Z' }),
        makePost({ id: 'reply-1', topicId: 't', createdAt: '2026-09-20T11:00:00Z' }),
      ],
      [bowel],
    );
    expect(topic?.opening?.id).toBe('opening');
    expect(topic?.firstReply?.id).toBe('reply-1');
    expect(topic?.room).toBe(bowel);
  });

  // Why removed rows are read at all. Without them the first reply would be
  // taken for the question, and the card would put the replier's words under
  // the asker's title.
  it('gives a topic with a removed opening post no opening, and does not promote a reply', () => {
    const [topic] = toHomeTopics(
      [summary({ id: 't', replyCount: 1 })],
      [
        makePost({
          id: 'opening',
          topicId: 't',
          body: '',
          removedAt: '2026-09-21T10:00:00Z',
          createdAt: '2026-09-20T10:00:00Z',
        }),
        makePost({ id: 'reply', topicId: 't', createdAt: '2026-09-20T11:00:00Z' }),
      ],
      [bowel],
    );
    expect(topic?.opening).toBeNull();
    expect(topic?.firstReply?.id).toBe('reply');
  });

  it('skips a removed reply when choosing the first one', () => {
    const [topic] = toHomeTopics(
      [summary({ id: 't', replyCount: 1 })],
      [
        makePost({ id: 'opening', topicId: 't', createdAt: '2026-09-20T10:00:00Z' }),
        makePost({
          id: 'gone',
          topicId: 't',
          body: '',
          removedAt: '2026-09-21T10:00:00Z',
          createdAt: '2026-09-20T11:00:00Z',
        }),
        makePost({ id: 'standing', topicId: 't', createdAt: '2026-09-20T12:00:00Z' }),
      ],
      [bowel],
    );
    expect(topic?.firstReply?.id).toBe('standing');
  });

  // A reply to an answer belongs under that answer (20260930000000). The card
  // shows the first answer to the topic, not the first reply to anything.
  it('skips a reply that sits under another post when choosing the first one', () => {
    const [topic] = toHomeTopics(
      [summary({ id: 't', replyCount: 2 })],
      [
        makePost({ id: 'opening', topicId: 't', createdAt: '2026-09-20T10:00:00Z' }),
        makePost({
          id: 'under-opening',
          topicId: 't',
          replyTo: 'opening',
          createdAt: '2026-09-20T11:00:00Z',
        }),
        makePost({ id: 'answer', topicId: 't', createdAt: '2026-09-20T12:00:00Z' }),
      ],
      [bowel],
    );
    expect(topic?.firstReply?.id).toBe('answer');
  });

  it('calls a topic a photo topic when its opening post has a photograph', () => {
    const topics = toHomeTopics(
      [summary({ id: 'plain' }), summary({ id: 'photo' }), summary({ id: 'reply-photo' })],
      [
        makePost({ topicId: 'plain' }),
        makePost({ topicId: 'photo', attachments: ['rooms/bowel/a.webp'] }),
        makePost({ id: 'o', topicId: 'reply-photo', createdAt: '2026-09-20T10:00:00Z' }),
        // A photograph in a reply does not make the topic a photograph.
        makePost({
          id: 'r',
          topicId: 'reply-photo',
          createdAt: '2026-09-20T11:00:00Z',
          attachments: ['rooms/bowel/b.webp'],
        }),
      ],
      [bowel],
    );
    expect(Object.fromEntries(topics.map((t) => [t.id, t.photo]))).toEqual({
      plain: false,
      photo: true,
      'reply-photo': false,
    });
  });

  it('is not a photo topic once its opening post is removed', () => {
    const [topic] = toHomeTopics(
      [summary({ id: 't' })],
      [makePost({ topicId: 't', removedAt: '2026-09-21T10:00:00Z', attachments: [] })],
      [bowel],
    );
    expect(topic?.photo).toBe(false);
  });

  // An administrator reads closed rooms. Home must not show them topics no
  // member can follow them into.
  it('drops a topic in a closed room, and in a room it was not handed', () => {
    const topics = toHomeTopics(
      [
        summary({ id: 'open', roomId: 'bowel' }),
        summary({ id: 'closed', roomId: 'skin' }),
        summary({ id: 'unknown', roomId: 'gone' }),
      ],
      [],
      [bowel, makeRoom({ id: 'skin', name: 'Skin & pressure sores', openedAt: null })],
    );
    expect(topics.map((t) => t.id)).toEqual(['open']);
  });

  it('keeps a topic whose author has left the club', () => {
    const [topic] = toHomeTopics(
      [summary({ id: 't', authorId: null })],
      [makePost({ topicId: 't', authorId: null })],
      [bowel],
    );
    expect(topic?.authorId).toBeNull();
    expect(topic?.opening).not.toBeNull();
  });

  it('orders by activity, newest first, the same way on every call', () => {
    const given = [
      summary({ id: 'b', lastPostAt: '2026-09-20T10:00:00Z' }),
      summary({ id: 'old', lastPostAt: '2026-09-18T10:00:00Z' }),
      summary({ id: 'new', lastPostAt: '2026-09-22T10:00:00Z' }),
      summary({ id: 'a', lastPostAt: '2026-09-20T10:00:00Z' }),
    ];
    const once = toHomeTopics(given, [], [bowel]).map((t) => t.id);
    const again = toHomeTopics([...given].reverse(), [], [bowel]).map((t) => t.id);
    expect(once).toEqual(['new', 'a', 'b', 'old']);
    expect(again).toEqual(once);
  });

  it('draws the title alone for a topic whose posts were not read', () => {
    const [topic] = toHomeTopics([summary({ id: 't' })], [], [bowel]);
    expect(topic?.opening).toBeNull();
    expect(topic?.firstReply).toBeNull();
  });
});
