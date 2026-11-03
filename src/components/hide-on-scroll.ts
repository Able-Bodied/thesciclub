import { useEffect, useState } from 'react';

/** Less than this is a finger settling, not a direction. */
const SLOP = 8;
/** Near the top of a page the bar always shows. */
const NEAR_TOP = 40;
/** A page with no more to scroll than this would only jump as the bar went. */
const LEAST_ROOM = 120;

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
      else if (room >= LEAST_ROOM) setHidden(top > before);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [enabled]);

  return {
    hidden,
    show: () => {
      setHidden(false);
    },
  };
}
