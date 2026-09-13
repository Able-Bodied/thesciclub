/**
 * The order members come off the deck in.
 *
 * Filters decide *who* is in the deck; this decides who is on top. It is a
 * separate, exported function because ordering is the kind of thing that gets
 * argued about, and an argument is easier to have against a test than against a
 * comparator buried in JSX.
 *
 * Four signals, in descending weight:
 *
 * 1. **Same state.** The strongest thing we have that costs nothing. Somewhere
 *    close plus a shared injury is the whole premise of meeting up.
 * 2. **Same region of injury.** Cervical, thoracic, lumbar. This is a heavier
 *    signal here than in a general disability app: a C5 quad and a T12 para
 *    share a diagnosis and very little else about a given Tuesday — transfers,
 *    hand function, bowel programmes and what help is needed all differ. Two
 *    people at the same region recognise each other's day.
 * 3. **Stage.** Somebody under a year in wants a person five to ten years
 *    ahead — proof it gets better. Everybody else wants a similar stage,
 *    because by then what people want is somebody to do things with rather than
 *    somebody to ask.
 * 4. **Shared interests.** The line that makes a card worth tapping, and the
 *    tiebreak once the rest are level.
 *
 * **Everything degrades when data is missing.** The seeded directory has no
 * injury dates at all, so stage contributes nothing for those members rather
 * than pushing them to the bottom — a member we know less about is not less
 * relevant, and a ranking that punishes incomplete profiles would bury the
 * people who joined first.
 */

import { isNewlyInjured, yearsSinceInjury } from '@/lib/injury';
import type { BrowseMember } from '@/types/domain';

/** How many interests two people share. */
export function sharedInterests(a: BrowseMember, b: BrowseMember): string[] {
  const mine = new Set(a.interests);
  return b.interests.filter((i) => mine.has(i));
}

/**
 * How well a candidate's stage suits the viewer's, 0..1, or null when either
 * side has no injury date.
 */
export function stageScore(viewer: BrowseMember, candidate: BrowseMember): number | null {
  const viewerYears = yearsSinceInjury(viewer);
  const candidateYears = yearsSinceInjury(candidate);
  if (viewerYears === null || candidateYears === null) return null;

  if (isNewlyInjured(viewer)) {
    const ahead = candidateYears - viewerYears;
    if (ahead <= 0) return 0;
    // Peaks at 7.5 years ahead — the middle of the five-to-ten band — and falls
    // away either side rather than cutting off, because somebody four years
    // ahead is still worth meeting.
    return 1 / (1 + Math.abs(ahead - 7.5) / 7.5);
  }

  return 1 / (1 + Math.abs(candidateYears - viewerYears) / 5);
}

/** Higher sorts first. Exported so the weighting is visible to a test rather than implied. */
export function relevanceScore(viewer: BrowseMember, candidate: BrowseMember): number {
  // Both empty is not a match. State is optional since onboarding gained a
  // Skip, and scoring two people who have not said where they live as
  // neighbours would put them at the top of each other's decks for a fact
  // neither of them gave.
  const sameState = viewer.state && candidate.state === viewer.state ? 1 : 0;
  const sameRegion = candidate.region === viewer.region && candidate.region !== 'Unknown' ? 1 : 0;
  const stage = stageScore(viewer, candidate) ?? 0;
  const shared = sharedInterests(viewer, candidate).length;

  // A mentor surfaces above an equivalent peer for somebody in their first year.
  // CONTEXT.md: mentors appear first to newly injured members.
  const mentorLift = isNewlyInjured(viewer) === true && candidate.type === 'mentor' ? 1 : 0;

  return sameState * 100 + sameRegion * 30 + mentorLift * 20 + stage * 10 + Math.min(shared, 5);
}

/**
 * Returns a new array; does not mutate. Ties keep their incoming order, so the
 * deck does not reshuffle under somebody as they scroll.
 */
export function rankMembers<T extends BrowseMember>(
  members: T[],
  viewer: BrowseMember | null,
): T[] {
  if (!viewer) return [...members];
  return members
    .map((member, index) => ({ member, index, score: relevanceScore(viewer, member) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.member);
}
