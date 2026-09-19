import { PlaceholderScreen } from '@/components/placeholder-screen';

/**
 * Chat — direct messages, event groups, and topic rooms.
 *
 * **Being built, from 2026-09-18.** This placeholder is what is here until it
 * is; see "Next up: Chat" in HANDOFF.md for the brief and docs/index.html for
 * the mock it comes from.
 *
 * The objection that kept it deferred still holds and is a constraint on the
 * build rather than an argument against it: a room of two dozen members is
 * empty by construction, and the mock's threads read well because they were
 * written rather than lived.
 *
 * Whatever lands first, it says what it cannot do rather than implying it can —
 * the rule this file exists to follow does not lapse halfway through.
 */
export default function ChatPage() {
  return (
    <PlaceholderScreen
      title="Chat"
      blurb="Direct messages, groups for events you are going to, and rooms by topic."
      note="Not built yet — it is the next thing being built."
    />
  );
}
