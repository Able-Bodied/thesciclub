import { useEffect, useState } from 'react';

/** Less than this is a finger settling, not a direction. */
const SLOP = 8;
/** Near the top of a page the bar always shows. */
const NEAR_TOP = 40;
/** A page with no more to scroll than this would only jump as the bar went. */
const LEAST_ROOM = 120;
/** A scroll this soon after a touch, wheel or key is the reader's own. */
export const INTENT_MS = 500;
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

/**
 * Whether a finger is what this device is mainly used with. A narrow window on
 * a computer has the phone's bottom bar too, and with a mouse or trackpad the
 * bar going and coming is only the page jumping (the owner, 2026-11-02).
 */
export function touchScreen(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Whether the phone's tab bar is out of the way (the owner, 2026-11-01): it
 * slides off as a page is read down and comes back on the way up, for the room.
 *
 * Every screen scrolls its own box, so this listens for all of them at once, a
 * scroll being caught on its way down the page though it does not bubble. A
 * change of `place` brings the bar back: nobody arrives on a screen without it.
 */
export function useHideOnScroll(enabled: boolean, place: string) {
  const [hidden, setHidden] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `place` is why it runs again.
  useEffect(() => {
    setHidden(false);
  }, [place, enabled]);

  useEffect(() => {
    if (!enabled) return;
    // Only the reader's own scrolling moves the bar. A conversation jumping to
    // its newest message is the page's, and hiding the bar for it resized the
    // list, which moved it again: the bounce on opening (2026-11-03).
    let touching = false;
    let lastIntent = Number.NEGATIVE_INFINITY;
    const intent = () => {
      lastIntent = Date.now();
    };
    const onTouchStart = () => {
      touching = true;
      intent();
    };
    const onTouchEnd = () => {
      touching = false;
      intent();
    };
    const onKey = (event: KeyboardEvent) => {
      // Typing in a box is not scrolling, whatever the key.
      const field = event.target instanceof HTMLElement ? event.target : null;
      if (field?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (SCROLL_KEYS.has(event.key)) intent();
    };
    const theirs = () => touching || Date.now() - lastIntent <= INTENT_MS;
    const seen = new WeakMap<HTMLElement, number>();
    const heights = new WeakMap<HTMLElement, number>();
    const onScroll = (event: Event) => {
      const box = event.target;
      if (!(box instanceof HTMLElement)) return;
      const room = box.scrollHeight - box.clientHeight;
      // Safari's rubber band at the bottom would read as turning back.
      const top = Math.min(box.scrollTop, room);
      // The bar going or coming resizes the box, which moves a page scrolled to
      // its end (or a chat holding its newest message in view) by itself. That
      // is not the reader turning, and taking it for one sets the bar going
      // and coming for ever (the owner's video, 2026-11-03).
      const height = heights.get(box);
      heights.set(box, box.clientHeight);
      if (height !== undefined && height !== box.clientHeight) {
        seen.set(box, top);
        return;
      }
      const before = seen.get(box) ?? 0;
      if (Math.abs(top - before) < SLOP && top > NEAR_TOP) return;
      seen.set(box, top);
      if (top <= NEAR_TOP) setHidden(false);
      else if (room >= LEAST_ROOM && theirs()) setHidden(top > before);
    };
    const listen = { capture: true, passive: true } as const;
    document.addEventListener('scroll', onScroll, listen);
    document.addEventListener('touchstart', onTouchStart, listen);
    document.addEventListener('touchmove', intent, listen);
    document.addEventListener('touchend', onTouchEnd, listen);
    document.addEventListener('touchcancel', onTouchEnd, listen);
    document.addEventListener('wheel', intent, listen);
    document.addEventListener('keydown', onKey, listen);
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      document.removeEventListener('touchstart', onTouchStart, { capture: true });
      document.removeEventListener('touchmove', intent, { capture: true });
      document.removeEventListener('touchend', onTouchEnd, { capture: true });
      document.removeEventListener('touchcancel', onTouchEnd, { capture: true });
      document.removeEventListener('wheel', intent, { capture: true });
      document.removeEventListener('keydown', onKey, { capture: true });
    };
  }, [enabled]);

  return {
    hidden,
    show: () => {
      setHidden(false);
    },
  };
}
