import { PlaceholderScreen } from '@/components/placeholder-screen';

/**
 * Home — the mixed feed (questions, photo posts, events, member suggestions)
 * from the mock. Deliberately not built yet: it needs four content types and a
 * moderation story, and none of the three flows this app is being built around
 * depend on it. See docs/CONTEXT.md, "Deliberately deferred".
 */
export default function HomePage() {
  return (
    <PlaceholderScreen
      title="Home"
      blurb="The club feed — questions members have asked, photos, and what is coming up near you."
      note="Not built yet. Peers, Events, and your profile are the working surfaces."
    />
  );
}
