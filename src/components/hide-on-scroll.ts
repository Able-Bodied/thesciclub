import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Less than this is a finger settling, not a direction. */
const SLOP = 8;
/** Near the top of a page the bar always shows. */
const NEAR_TOP = 40;
/** Within this of a page's end, it is at the end (the rubber band aside). */
const AT_END = 4;
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
  // The page whose end brought the bar back, to keep that end in view.
  const endOf = useRef<HTMLElement | null>(null);

  // The bar coming back takes its room from the bottom of the page, which
  // pushed what the reader had scrolled down to (a Delete button, the owner,
  // 2026-11-08) back out of sight. Held at its end, the page keeps it.
  useLayoutEffect(() => {
    const box = endOf.current;
    endOf.current = null;
    if (hidden || !box?.isConnected || typeof box.scrollTo !== 'function') return;
    box.scrollTo({ top: box.scrollHeight });
  }, [hidden]);

  // Pages read to their end on this screen: the bar stays for them, however
  // long they grow after (a Show more, a button opening), until a new screen
  // (the owner, 2026-11-08).
  const ended = useRef(new WeakSet<HTMLElement>());

  // biome-ignore lint/correctness/useExhaustiveDependencies: `place` is why it runs again.
  useEffect(() => {
    setHidden(false);
    ended.current = new WeakSet();
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
      // At the end of a page the bar comes back and stays: nothing below is
      // left to make room for, and what is there (a button that just opened)
      // must not slide away (the owner, 2026-11-08).
      const atEnd = room - top <= AT_END && top > before;
      if (Math.abs(top - before) < SLOP && top > NEAR_TOP && !atEnd) return;
      seen.set(box, top);
      // Only the scroll that reaches the end, so a later show elsewhere (a
      // tap) never throws the reader to the bottom.
      endOf.current = atEnd ? box : null;
      if (atEnd) ended.current.add(box);
      if (atEnd) setHidden(false);
      else if (ended.current.has(box)) return;
      else if (top <= NEAR_TOP || before - top >= BACK_UP) setHidden(false);
      else if (roomHidden(box) < LEAST_ROOM) recheck();
      else if (theirs()) {
        // Not going for the last of a page: it would only come back at the
        // end, a flicker over whatever is down there.
        if (top > before && room - top <= (bar.current?.offsetHeight ?? 0) + AT_END) return;
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
