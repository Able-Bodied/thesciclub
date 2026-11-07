import { type MouseEvent, type PointerEvent, useRef, useState } from 'react';

/**
 * Drag a conversation left to see each message's date, as on iMessage. Touch
 * and pen only: a mouse drag selects text. Extra, never the only way: the day
 * headings and each time's tooltip say the same.
 */

/** How far the messages slide, and so how wide the dates are. */
export const SWIPE_MAX = 64;
/** iOS's back gesture starts at the left edge. */
const EDGE = 24;
const START = 10;

/** 'swipe' once a drag is clearly sideways and leftward, 'scroll' once it is not. */
export function swipeIntent(dx: number, dy: number): 'swipe' | 'scroll' | null {
  if (Math.abs(dy) > START && Math.abs(dy) >= Math.abs(dx)) return 'scroll';
  if (Math.abs(dx) > START && Math.abs(dx) > 1.5 * Math.abs(dy)) return dx < 0 ? 'swipe' : 'scroll';
  return null;
}

export function useSwipeDates() {
  const [offset, setOffset] = useState(0);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    intent: 'swipe' | 'scroll' | null;
  } | null>(null);
  // A swipe that ends on a button is not a press of it.
  const swiped = useRef(false);
  function end() {
    drag.current = null;
    setOffset(0);
  }
  return {
    offset,
    handlers: {
      onPointerDown(event: PointerEvent) {
        swiped.current = false;
        if (event.pointerType === 'mouse' || event.clientX < EDGE) return;
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, intent: null };
      },
      onPointerMove(event: PointerEvent) {
        const now = drag.current;
        if (now?.id !== event.pointerId || now.intent === 'scroll') return;
        const dx = event.clientX - now.x;
        now.intent ??= swipeIntent(dx, event.clientY - now.y);
        if (now.intent !== 'swipe') return;
        swiped.current = true;
        setOffset(Math.min(SWIPE_MAX, Math.max(0, -dx)));
      },
      onPointerUp: end,
      onPointerCancel: end,
      onClickCapture(event: MouseEvent) {
        if (!swiped.current) return;
        swiped.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
    },
  };
}
