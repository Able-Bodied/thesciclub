import { describe, expect, it } from 'vitest';

import {
  EDGE_GUARD_PX,
  inEdgeGuard,
  nextSegment,
  SWIPE_THRESHOLD_PX,
  startsInHorizontalScroller,
  swipeDirection,
} from '@/routes/peers/swipe';

describe('swipeDirection', () => {
  it('ignores a drag too short to be deliberate', () => {
    expect(swipeDirection(SWIPE_THRESHOLD_PX - 1, 0)).toBeNull();
    expect(swipeDirection(-(SWIPE_THRESHOLD_PX - 1), 0)).toBeNull();
  });

  it('reads a long horizontal drag as a swipe', () => {
    expect(swipeDirection(-120, 4)).toBe('left');
    expect(swipeDirection(120, 4)).toBe('right');
  });

  it('gives an ambiguous diagonal to the vertical scroll', () => {
    // The deck scrolls vertically. Changing segment underneath someone who was scrolling is worse
    // than making them repeat a sloppy swipe.
    expect(swipeDirection(-120, 100)).toBeNull();
  });
});

describe('nextSegment', () => {
  it('moves between the two segments', () => {
    expect(nextSegment('everyone', 'left')).toBe('near');
    expect(nextSegment('near', 'left')).toBe('mentors');
    expect(nextSegment('mentors', 'right')).toBe('near');
    expect(nextSegment('near', 'right')).toBe('everyone');
  });

  it('stops at each end rather than wrapping', () => {
    // With two items a wrap reads as a glitch (PRD §7.2).
    expect(nextSegment('mentors', 'left')).toBe('mentors');
    expect(nextSegment('everyone', 'right')).toBe('everyone');
  });

  it('is a no-op without a direction', () => {
    expect(nextSegment('everyone', null)).toBe('everyone');
  });
});

describe('inEdgeGuard', () => {
  it('ignores a drag beginning where iOS reserves the back gesture', () => {
    expect(inEdgeGuard(0)).toBe(true);
    expect(inEdgeGuard(EDGE_GUARD_PX)).toBe(true);
    expect(inEdgeGuard(EDGE_GUARD_PX + 1)).toBe(false);
  });
});

/**
 * jsdom reports every element as 0x0, so scroll geometry has to be set explicitly. These stand in
 * for the interest-pill strip along the bottom of a card.
 */
function scroller({ scrollWidth = 400, clientWidth = 200, scrollLeft = 0 } = {}): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth });
  Object.defineProperty(el, 'clientWidth', { value: clientWidth });
  el.scrollLeft = scrollLeft;
  return el;
}

describe('startsInHorizontalScroller', () => {
  it('lets a pill strip with room left keep the gesture', () => {
    const root = document.createElement('div');
    const strip = scroller({ scrollLeft: 0 });
    const pill = document.createElement('button');
    strip.append(pill);
    root.append(strip);

    expect(startsInHorizontalScroller(pill, root, 'left')).toBe(true);
  });

  it('hands the gesture up once the strip has hit its own end', () => {
    const root = document.createElement('div');
    // 400 wide in a 200 viewport, scrolled fully right: nothing further to reveal.
    const strip = scroller({ scrollLeft: 200 });
    const pill = document.createElement('button');
    strip.append(pill);
    root.append(strip);

    expect(startsInHorizontalScroller(pill, root, 'left')).toBe(false);
    // ...but it still owns a drag back the other way.
    expect(startsInHorizontalScroller(pill, root, 'right')).toBe(true);
  });

  it('does not claim a gesture that began outside any scroller', () => {
    const root = document.createElement('div');
    const plain = document.createElement('p');
    root.append(plain);

    expect(startsInHorizontalScroller(plain, root, 'left')).toBe(false);
  });

  it('stops looking at the deck root', () => {
    // The deck itself is not a horizontal scroller, but this guards against a future ancestor
    // outside it swallowing every swipe.
    const outer = scroller();
    const root = document.createElement('div');
    const pill = document.createElement('button');
    root.append(pill);
    outer.append(root);

    expect(startsInHorizontalScroller(pill, root, 'left')).toBe(false);
  });
});
