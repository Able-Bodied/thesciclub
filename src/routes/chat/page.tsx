import { PlaceholderScreen } from '@/components/placeholder-screen';

/**
 * Chat — direct messages, event groups, and topic rooms. Deferred on purpose:
 * a room of two dozen members is empty by construction, and the mock's threads
 * read well because they are written rather than lived. See CONTEXT.md.
 */
export default function ChatPage() {
  return (
    <PlaceholderScreen
      title="Chat"
      blurb="Direct messages, groups for events you are going to, and rooms by topic."
      note="Not built yet. It arrives once there are enough members for a room to be worth opening."
    />
  );
}
