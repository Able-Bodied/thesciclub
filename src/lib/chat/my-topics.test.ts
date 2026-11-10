import { describe, expect, it } from 'vitest';
import { filterMyTopics, type MyTopic } from '@/lib/chat/my-topics';
import type { ChatRoom } from '@/lib/chat/types';

const room = (id: string, category: ChatRoom['category'], open = true) =>
  ({ id, category, openedAt: open ? '2026-10-01T00:00:00Z' : null }) as ChatRoom;
const topic = (id: string, roomId: string, isQuestion: boolean, createdAt: string): MyTopic => ({
  id,
  roomId,
  title: id,
  createdAt,
  replyCount: 0,
  isQuestion,
});

describe('My posts filters', () => {
  const rooms = [room('general', 'General'), room('bladder', 'Body'), room('shut', 'Body', false)];
  const topics = [
    topic('q-general', 'general', true, '2026-11-01T00:00:00Z'),
    topic('p-bladder', 'bladder', false, '2026-11-03T00:00:00Z'),
    topic('q-bladder', 'bladder', true, '2026-11-02T00:00:00Z'),
    topic('in-closed-room', 'shut', false, '2026-11-04T00:00:00Z'),
  ];
  const ids = (kind: 'all' | 'question' | 'post', category: 'all' | 'General' | 'Body') =>
    filterMyTopics(topics, rooms, kind, category).map((t) => t.id);

  it('filters by kind and room type, newest first, leaving out closed rooms', () => {
    expect(ids('all', 'all')).toEqual(['p-bladder', 'q-bladder', 'q-general']);
    expect(ids('question', 'all')).toEqual(['q-bladder', 'q-general']);
    expect(ids('post', 'Body')).toEqual(['p-bladder']);
    expect(ids('all', 'General')).toEqual(['q-general']);
  });
});
