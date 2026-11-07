import { type RefObject, useEffect, useState } from 'react';

/** Less than this is a finger settling, not a direction. */
const SLOP = 8;
/** Near the top of a page the bar always shows. */
const NEAR_TOP = 40;
/** Room a page must keep with the bar gone, or it only jumps as the bar goes. */
const LEAST_ROOM = 120;
/**
 * Back up the page this far brings the bar back, whoever moved it: a flick's
 * momentum runs on after the finger lifts, and the bar stayed away until the
 * top (the owner, 2026-11-06). Only going needs the reader's own scroll.
 */
const BACK_UP = 24;
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
 * change of `place` brings the bar back: nobody arrives on a screen without it,
 * and so does a tap that scrolled nothing (the owner, 2026-11-06).
 */
export function useHideOnScroll(
  enabled: boolean,
  place: string,
  bar: RefObject<HTMLElement | null>,
) {
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
    let scrolledInTouch = false;
    let lastIntent = Number.NEGATIVE_INFINITY;
    const intent = () => {
      lastIntent = Date.now();
    };
    const onTouchStart = () => {
      touching = true;
      scrolledInTouch = false;
      intent();
    };
    const onTouchEnd = (event: Event) => {
      touching = false;
      intent();
      // A tap: a finger down and up with nothing scrolled between. Not one
      // into a box to type in, which would move what is being written.
      const field = event.target instanceof Element ? event.target : null;
      if (
        event.type === 'touchend' &&
        !scrolledInTouch &&
        !field?.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        setHidden(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      // Typing in a box is not scrolling, whatever the key.
      const field = event.target instanceof HTMLElement ? event.target : null;
      if (field?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (SCROLL_KEYS.has(event.key)) intent();
    };
    const theirs = () => touching || Date.now() - lastIntent <= INTENT_MS;
    // Room left with the bar gone, the same whether it is shown, hidden or
    // on its way. A page that kept less pulled itself back near the top as
    // the bar went, which brought the bar back: the bounce (the owner,
    // 2026-11-04).
    const roomHidden = (box: HTMLElement) => {
      const nav = bar.current;
      const height = nav?.offsetHeight ?? 0;
      const away = nav ? -Number.parseFloat(getComputedStyle(nav).marginBottom) || 0 : 0;
      const gone = Math.min(Math.max(away, 0), height);
      return box.scrollHeight - box.clientHeight + gone - height;
    };
    // The page that sent the bar away brings it back once it lacks the room
    // (shorter now, or the window resized).
    let owner: HTMLElement | null = null;
    const recheck = () => {
      if (owner?.isConnected && roomHidden(owner) < LEAST_ROOM) setHidden(false);
    };
    const seen = new WeakMap<HTMLElement, number>();
    const sizes = new WeakMap<HTMLElement, string>();
    const onScroll = (event: Event) => {
      const box = event.target;
      if (!(box instanceof HTMLElement)) return;
      if (touching) scrolledInTouch = true;
      const room = box.scrollHeight - box.clientHeight;
      // Safari's rubber band at the bottom would read as turning back.
      const top = Math.min(box.scrollTop, room);
      // The bar going or coming resizes the box, which moves a page scrolled to
      // its end (or a chat holding its newest message in view) by itself. That
      // is not the reader turning, and taking it for one sets the bar going
      // and coming for ever (the owner's video, 2026-11-03). So does its
      // content changing size.
      const was = sizes.get(box);
      const size = `${box.clientHeight} ${box.scrollHeight}`;
      sizes.set(box, size);
      if (was !== undefined && was !== size) {
        seen.set(box, top);
        recheck();
        return;
      }
      // A scroll that goes on from the reader's own stays theirs while it keeps
      // moving. An iPhone can stop telling of the finger once the bar slides
      // in, the page still following it, and the bar would not go again until
      // the finger lifted (the owner, 2026-11-06).
      if (theirs()) intent();
      const before = seen.get(box) ?? 0;
      if (Math.abs(top - before) < SLOP && top > NEAR_TOP) return;
      seen.set(box, top);
      if (top <= NEAR_TOP || before - top >= BACK_UP) setHidden(false);
      else if (roomHidden(box) < LEAST_ROOM) recheck();
      else if (theirs()) {
        owner = box;
        setHidden(top > before);
      }
    };
    const listen = { capture: true, passive: true } as const;
    document.addEventListener('scroll', onScroll, listen);
    document.addEventListener('touchstart', onTouchStart, listen);
    document.addEventListener('touchmove', intent, listen);
    document.addEventListener('touchend', onTouchEnd, listen);
    document.addEventListener('touchcancel', onTouchEnd, listen);
    document.addEventListener('wheel', intent, listen);
    document.addEventListener('keydown', onKey, listen);
    window.addEventListener('resize', recheck);
    return () => {
      window.removeEventListener('resize', recheck);
      document.removeEventListener('scroll', onScroll, { capture: true });
      document.removeEventListener('touchstart', onTouchStart, { capture: true });
      document.removeEventListener('touchmove', intent, { capture: true });
      document.removeEventListener('touchend', onTouchEnd, { capture: true });
      document.removeEventListener('touchcancel', onTouchEnd, { capture: true });
      document.removeEventListener('wheel', intent, { capture: true });
      document.removeEventListener('keydown', onKey, { capture: true });
    };
  }, [enabled, bar]);

  return {
    hidden,
    show: () => {
      setHidden(false);
    },
  };
}
