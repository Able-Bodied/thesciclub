import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isStandalone } from '@/lib/standalone';

interface Swipe {
  x: number;
  y: number;
  id: number;
  started: number;
}

function hasEarlierScreen(): boolean {
  const state: unknown = window.history.state;
  return (
    state !== null &&
    typeof state === 'object' &&
    'idx' in state &&
    typeof state.idx === 'number' &&
    state.idx > 0
  );
}

/** A sideways scroller, control or dialog already owns the finger's gesture. */
function ownsGesture(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (
    document.querySelector('[role="dialog"], dialog[open]') ||
    target.closest(
      'a, button, input, textarea, select, label, summary, video, iframe, [contenteditable]:not([contenteditable="false"]), [role="slider"]',
    ) ||
    window.getSelection()?.isCollapsed === false
  )
    return true;
  for (let node: Element | null = target; node; node = node.parentElement) {
    if (
      node.scrollWidth > node.clientWidth &&
      /^(auto|scroll)$/.test(getComputedStyle(node).overflowX)
    )
      return true;
  }
  return false;
}

/**
 * Phone gestures belong to the Home Screen app. A browser tab keeps its own
 * zoom and history gestures; Me's text sizes still work in either place.
 *
 * Back starts at the left edge, not across a card or a conversation. Router's
 * index proves there is an earlier screen in this app: a fresh deep link must
 * never swipe into a different site or close the installed window.
 */
export function InstalledApp() {
  const { key } = useLocation();
  const navigate = useNavigate();

  // A route change must cancel a finger still held on the preceding screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: key resets the gesture between screens.
  useEffect(() => {
    const query =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null;
    let remove: () => void = () => undefined;

    function update() {
      remove();
      if (!isStandalone()) return;
      document.documentElement.dataset.installedApp = '';
      let swipe: Swipe | null = null;
      function cancel() {
        swipe = null;
      }
      function start(event: TouchEvent) {
        swipe = null;
        if (event.touches.length !== 1 || ownsGesture(event.target) || !hasEarlierScreen()) return;
        const finger = event.touches[0];
        if (!finger || finger.clientX > 28) return;
        swipe = {
          x: finger.clientX,
          y: finger.clientY,
          id: finger.identifier,
          started: performance.now(),
        };
      }
      function move(event: TouchEvent) {
        // CSS handles pinch zoom on Android. Safari also needs its gesture
        // event, and older phones need the multi-touch move cancelled.
        if (event.touches.length > 1) {
          cancel();
          event.preventDefault();
          return;
        }
        if (!swipe || event.touches.length !== 1) return;
        const finger = event.touches[0];
        if (!finger) return;
        const dx = finger.clientX - swipe.x;
        const dy = Math.abs(finger.clientY - swipe.y);
        if (dy > 12 && dy > Math.abs(dx)) cancel();
        else if (dx > 20 && dx > dy * 2) event.preventDefault();
      }
      function end(event: TouchEvent) {
        const began = swipe;
        cancel();
        if (!began || event.changedTouches.length !== 1) return;
        const finger = event.changedTouches[0];
        if (!finger) return;
        const dx = finger.clientX - began.x;
        if (
          finger.identifier === began.id &&
          dx >= 72 &&
          dx > Math.abs(finger.clientY - began.y) * 2 &&
          performance.now() - began.started < 800 &&
          !ownsGesture(event.target) &&
          hasEarlierScreen()
        ) {
          event.preventDefault();
          void navigate(-1);
        }
      }
      function gesture(event: Event) {
        cancel();
        event.preventDefault();
      }
      document.addEventListener('touchstart', start, { passive: true });
      document.addEventListener('touchmove', move, { passive: false });
      document.addEventListener('touchend', end, { passive: false });
      document.addEventListener('touchcancel', cancel);
      document.addEventListener('gesturestart', gesture, { passive: false });
      document.addEventListener('gesturechange', gesture, { passive: false });
      remove = () => {
        delete document.documentElement.dataset.installedApp;
        document.removeEventListener('touchstart', start);
        document.removeEventListener('touchmove', move);
        document.removeEventListener('touchend', end);
        document.removeEventListener('touchcancel', cancel);
        document.removeEventListener('gesturestart', gesture);
        document.removeEventListener('gesturechange', gesture);
        cancel();
      };
    }

    update();
    query?.addEventListener('change', update);
    return () => {
      query?.removeEventListener('change', update);
      remove();
    };
  }, [key, navigate]);

  return null;
}
