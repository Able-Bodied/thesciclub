import { describe, expect, it } from 'vitest';
import { backFromTopic } from '@/routes/chat/back';
import { makeRoom } from '@/test/factory';

describe('backFromTopic', () => {
  const room = makeRoom({ id: 'bowel', name: 'Bowel management' });

  it('goes back to the room', () => {
    expect(backFromTopic(null, room)).toEqual({
      to: '/chat/rooms/bowel',
      label: 'Bowel management',
    });
  });

  it('goes back to Home, and its pill, when that is where the topic was opened', () => {
    expect(backFromTopic({ from: 'home', segment: 'photos' }, room)).toEqual({
      to: '/home?segment=photos',
      label: 'Home',
    });
  });

  it('goes to Chat when the room is not known', () => {
    expect(backFromTopic(null, null)).toEqual({ to: '/chat', label: 'Chat' });
    expect(backFromTopic({ from: 'home' }, null)).toEqual({ to: '/home', label: 'Home' });
  });
});
