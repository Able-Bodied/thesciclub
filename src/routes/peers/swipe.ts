/**
 * Horizontal swipe between the Peers segments.
 *
 * Lifted from ab-peers, where these edge cases were found on real hardware.
 *
 * The gesture is an accelerator and never the only way through — the segment pills do exactly the
 * same thing with a tap, because switch control, keyboard and VoiceOver users cannot reliably
 * swipe. That is the same rule that ruled out swipe-to-decide in the first place, and it is why
 * this module only ever *reports* a direction: the page applies it through the same handler the
 * pills use.
 *
 * Two conflicts the PRD calls out, both handled here rather than in the page:
 *
 * - **Nested horizontal scrollers.** The interest and topic strips along the bottom of a card
 *   scroll horizontally. A drag that starts on one of them has to scroll the strip, not change
 *   segment. `startsInHorizontalScroller` walks up from the touched element looking for a
 *   scroller that still has somewhere to go, so the inner scroller keeps the gesture until it hits
 *   its own end. Detecting it from the DOM rather than from a prop means a new card component
 *   cannot forget to opt in.
 * - **The iOS left screen edge.** In a PWA or a browser tab, a drag starting within roughly 20px
 *   of the left edge is the system back gesture and we do not get it. Fighting for it gives people
 *   different behaviour depending on where their thumb landed, so a gesture that starts in the
 *   edge zone is ignored outright.
 */

import { PEERS_SEGMENTS, type PeersSegment } from '@/types/domain';

/** Wider than iOS's own ~20px, because the cost of ignoring one deliberate swipe is far lower
 * than the cost of half-triggering a system back gesture. */
export const EDGE_GUARD_PX = 24;

/** How far a drag has to travel before it counts as a swipe rather than a tap or a scroll nudge. */
export const SWIPE_THRESHOLD_PX = 56;

/**
 * How much more horizontal than vertical a drag has to be. The deck scrolls vertically, so an
 * ambiguous diagonal must resolve to "scrolling the deck", never to "changed segment underneath
 * you".
 */
export const SWIPE_RATIO = 1.5;

export type SwipeDirection = 'left' | 'right' | null;

export function swipeDirection(dx: number, dy: number): SwipeDirection {
  if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return null;
  if (Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return null;
  return dx < 0 ? 'left' : 'right';
}

/**
 * The segment a swipe lands on. Swiping left moves forward through the segments, matching the
 * content moving left under the thumb.
 *
 * Stops at each end rather than wrapping: a wrap reads as a glitch, and
 * returning the current segment unchanged is what makes the end feel like an end.
 */
export function nextSegment(current: PeersSegment, direction: SwipeDirection): PeersSegment {
  if (!direction) return current;
  const index = PEERS_SEGMENTS.indexOf(current);
  const target = direction === 'left' ? index + 1 : index - 1;
  return PEERS_SEGMENTS[target] ?? current;
}

/** True for a drag that begins in the zone iOS reserves for its own back gesture. */
export function inEdgeGuard(clientX: number): boolean {
  return clientX <= EDGE_GUARD_PX;
}

/**
 * Whether `target` sits inside a horizontal scroller — between it and `root` — that has not yet
 * hit the end it is being dragged toward. Once the strip is scrolled all the way, the gesture is
 * handed up and the segment changes, which is the standard nested-scrolling behaviour people
 * already expect.
 */
export function startsInHorizontalScroller(
  target: Element | null,
  root: Element | null,
  direction: SwipeDirection,
): boolean {
  for (let node = target; node && node !== root; node = node.parentElement) {
    const overflow = node.scrollWidth - node.clientWidth;
    if (overflow <= 0) continue;
    if (!direction) return true;
    // Dragging left reveals content further right, so the strip still owns the gesture until its
    // right end is reached.
    const room = direction === 'left' ? overflow - node.scrollLeft : node.scrollLeft;
    if (room > 1) return true;
  }
  return false;
}
