import type { ChatRoom } from '@/lib/chat/types';
import { backToHome } from '@/routes/home/back';

/**
 * Where a topic's back link goes, and what it says.
 *
 * Its room, ordinarily, because that is where a topic lives. Home when the
 * topic was opened from Home: a member who tapped a card there did not come
 * through the room, and a back link to a room they never saw sends them
 * somewhere new instead of back. Chat when the room is not known, which is a
 * topic in a room this reader cannot see.
 *
 * Pure, and a function of router state rather than of history, for the
 * reason `routes/events/back.ts` gives: a topic reached from a notification
 * or a shared link has no history to go back to.
 */
export function backFromTopic(
  state: unknown,
  room: ChatRoom | null,
): { to: string; label: string } {
  const home = backToHome(state);
  if (home) return { to: home, label: 'Home' };
  if (room) return { to: `/chat/rooms/${room.id}`, label: room.name };
  return { to: '/chat', label: 'Chat' };
}
