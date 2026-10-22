import { ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useDialogFocus } from '@/lib/dialog-focus';
import {
  type Box,
  isZoomed,
  MAX_SCALE,
  panBy,
  STEP,
  TAP_SCALE,
  UNZOOMED,
  type Zoom,
  zoomAt,
} from '@/lib/photo-zoom';

/**
 * A photograph over the whole page, to be looked at closely: the one-at-a-
 * time view of a message's or a post's photographs (src/routes/chat/
 * attachment-grid.tsx), and a member's own photograph from their profile
 * (src/routes/peers/member-detail.tsx), uncropped.
 *
 * ---------------------------------------------------------------------------
 * From one photograph to the next without going back
 * ---------------------------------------------------------------------------
 * When a message carries more than one, the open picture has a way to the
 * previous and the next: the arrow controls, the arrow keys, and a sideways
 * swipe. The label counts along ("2 of 4") so a screen reader knows it moved.
 * The ends do not wrap; the control at an end is disabled rather than hidden,
 * so the layout does not jump and a keyboard user is not left guessing.
 *
 * ---------------------------------------------------------------------------
 * The picture is a button, and the viewer closes three ways
 * ---------------------------------------------------------------------------
 * Tap, Enter or Space opens it; the close control, the backdrop and Escape all
 * close it. Members here drive with a switch, a head pointer or a keyboard as
 * often as a finger, and a viewer that closes only by tapping outside is a
 * trap for all three. The open picture takes focus so Escape reaches it.
 *
 * ---------------------------------------------------------------------------
 * The viewer is a dialog, and focus goes back where it came from
 * ---------------------------------------------------------------------------
 * It covers the page, so it says so: `role="dialog"` and `aria-modal`, and
 * Tab goes round its own controls instead of walking out into the chat that
 * is hidden behind it. When it closes, focus goes back to the tile that
 * opened it. Without that, a keyboard or switch user would land at the top of
 * the page and have to find their place in the conversation again.
 *
 * The backdrop is out of the Tab order. It is there for a pointer. A keyboard
 * already has the close control and Escape, and a focus ring round the whole
 * screen would say nothing about where focus is.
 *
 * ---------------------------------------------------------------------------
 * Zooming in
 * ---------------------------------------------------------------------------
 * The owner, 2026-10-15: a photograph is opened to be looked at closely, and
 * the installed app turns pinching off for the page as a whole (InstalledApp).
 * So the viewer zooms the picture itself: pinch, a double tap, the mouse
 * wheel, and, for a switch, a head pointer or a keyboard, Zoom in and Zoom
 * out buttons and the + and - keys (0 goes back). Zoomed, one finger or the
 * arrow keys move round the picture, as far as its edges; a swipe steps to
 * the next photograph only when it is not zoomed. The sums are in
 * src/lib/photo-zoom.ts. A new photograph starts unzoomed.
 *
 */

/** A sideways swipe of at least this many px, and more sideways than up, steps. */
const SWIPE_PX = 48;

/** Two taps this close in time and place are a double tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;
/** A finger that moves less than this is a tap, not a drag. */
const TAP_SLOP_PX = 10;
/** How far an arrow key moves a zoomed picture. */
const KEY_PAN_PX = 80;

type Gesture =
  | { kind: 'pan'; fromX: number; fromY: number; start: Zoom; moved: boolean }
  | { kind: 'pinch'; distance: number; midX: number; midY: number; start: Zoom };

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function PhotoViewer({
  url,
  label,
  title,
  index,
  count,
  onStep,
  onClose,
}: {
  url: string;
  /** The picture's own name, its alt text. */
  label: string;
  /** The dialog's name: "Photographs from Bo", "Bo's photograph". */
  title: string;
  index: number;
  count: number;
  onStep: (to: number) => void;
  onClose: () => void;
}) {
  const hasPrevious = index > 0;
  const hasNext = index < count - 1;
  const touch = useRef<{ x: number; y: number } | null>(null);
  // A second finger came down: a pinch, never a swipe to the next photograph.
  const pinched = useRef(false);
  const dialog = useRef<HTMLDivElement | null>(null);

  const picture = useRef<HTMLImageElement | null>(null);

  // Held with the photograph it belongs to, so stepping starts the next unzoomed.
  const [zoomed, setZoomed] = useState<{ url: string; zoom: Zoom }>({ url, zoom: UNZOOMED });
  const zoom = zoomed.url === url ? zoomed.zoom : UNZOOMED;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const setZoom = (next: Zoom) => {
    zoomRef.current = next;
    setZoomed({ url, zoom: next });
  };
  const [gesturing, setGesturing] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);

  /**
   * Where the fitted picture is, before it was moved or scaled. Read from the
   * layout, which a transform does not change, rather than from what is on
   * screen: mid-pinch, the screen is a frame behind the zoom being worked out.
   */
  function box(): Box {
    const element = picture.current;
    const frame = dialog.current?.getBoundingClientRect();
    const width = element?.offsetWidth ?? 0;
    const height = element?.offsetHeight ?? 0;
    return {
      centreX:
        element && frame ? frame.left + element.offsetLeft + width / 2 : window.innerWidth / 2,
      centreY:
        element && frame ? frame.top + element.offsetTop + height / 2 : window.innerHeight / 2,
      width,
      height,
      viewWidth: window.innerWidth,
      viewHeight: window.innerHeight,
    };
  }

  function zoomBy(factor: number) {
    const current = zoomRef.current;
    setZoom(
      zoomAt(current, current.scale * factor, window.innerWidth / 2, window.innerHeight / 2, box()),
    );
  }

  // In, round and back, as every sheet: focus starts on the picture, Tab goes
  // round the viewer's own controls (a disabled step control is skipped, and
  // Shift+Tab from the picture goes to the last control), Escape closes.
  useDialogFocus(dialog, picture, onClose);

  // The viewer's own keys: the arrows step, as a swipe does, or move round a
  // zoomed picture; + and - zoom, and 0 goes back.
  const zoomKeys = useRef({ zoomBy, box, setZoom });
  zoomKeys.current = { zoomBy, box, setZoom };
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const { zoomBy: by, box: where, setZoom: set } = zoomKeys.current;
      const current = zoomRef.current;
      if (event.key === '+' || event.key === '=') by(STEP);
      else if (event.key === '-' || event.key === '_') by(1 / STEP);
      else if (event.key === '0') set(UNZOOMED);
      else if (isZoomed(current) && event.key.startsWith('Arrow')) {
        event.preventDefault();
        const dx =
          event.key === 'ArrowLeft' ? KEY_PAN_PX : event.key === 'ArrowRight' ? -KEY_PAN_PX : 0;
        const dy =
          event.key === 'ArrowUp' ? KEY_PAN_PX : event.key === 'ArrowDown' ? -KEY_PAN_PX : 0;
        set(panBy(current, dx, dy, where()));
      } else if (event.key === 'ArrowLeft' && hasPrevious) onStep(index - 1);
      else if (event.key === 'ArrowRight' && hasNext) onStep(index + 1);
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onStep, index, hasPrevious, hasNext]);

  // Safari's own pinch would zoom the page behind in a browser tab, and a
  // wheel would scroll it: the viewer takes both. Not passive, so they can
  // be stopped, which React's own handlers cannot.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    function stop(event: Event) {
      event.preventDefault();
    }
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const { box: where, setZoom: set } = zoomKeys.current;
      const current = zoomRef.current;
      set(
        zoomAt(
          current,
          current.scale * Math.exp(-event.deltaY / 300),
          event.clientX,
          event.clientY,
          where(),
        ),
      );
    }
    element.addEventListener('gesturestart', stop, { passive: false });
    element.addEventListener('gesturechange', stop, { passive: false });
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('gesturestart', stop);
      element.removeEventListener('gesturechange', stop);
      element.removeEventListener('wheel', onWheel);
    };
  }, []);

  function onPointerDown(event: React.PointerEvent<HTMLImageElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const [a, b] = [...pointers.current.values()];
    if (a && b) {
      gesture.current = {
        kind: 'pinch',
        distance: Math.max(1, distance(a, b)),
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
        start: zoomRef.current,
      };
      setGesturing(true);
    } else if (a) {
      gesture.current = {
        kind: 'pan',
        fromX: a.x,
        fromY: a.y,
        start: zoomRef.current,
        moved: false,
      };
      if (isZoomed(zoomRef.current)) setGesturing(true);
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLImageElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const now = gesture.current;
    if (!now) return;
    if (now.kind === 'pinch') {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const where = box();
      const scaled = zoomAt(
        now.start,
        (now.start.scale * distance(a, b)) / now.distance,
        now.midX,
        now.midY,
        where,
      );
      setZoom(panBy(scaled, midX - now.midX, midY - now.midY, where));
      return;
    }
    const dx = event.clientX - now.fromX;
    const dy = event.clientY - now.fromY;
    if (Math.hypot(dx, dy) > TAP_SLOP_PX) now.moved = true;
    if (isZoomed(now.start)) setZoom(panBy(now.start, dx, dy, box()));
  }

  function onPointerEnd(event: React.PointerEvent<HTMLImageElement>) {
    if (!pointers.current.delete(event.pointerId)) return;
    const now = gesture.current;
    const left = [...pointers.current.values()][0];
    if (now?.kind === 'pinch') {
      // One finger still down carries on as a drag from where it is.
      gesture.current = left
        ? { kind: 'pan', fromX: left.x, fromY: left.y, start: zoomRef.current, moved: true }
        : null;
      if (!left) setGesturing(false);
      return;
    }
    gesture.current = null;
    setGesturing(false);
    if (!now || now.moved || event.type === 'pointercancel') return;
    // A tap: two in quick succession zoom in there, or back out.
    const tap = { at: event.timeStamp, x: event.clientX, y: event.clientY };
    const before = lastTap.current;
    if (
      before &&
      tap.at - before.at < DOUBLE_TAP_MS &&
      Math.hypot(tap.x - before.x, tap.y - before.y) < DOUBLE_TAP_PX
    ) {
      lastTap.current = null;
      const current = zoomRef.current;
      setZoom(isZoomed(current) ? UNZOOMED : zoomAt(current, TAP_SCALE, tap.x, tap.y, box()));
      return;
    }
    lastTap.current = tap;
  }

  // 44px round controls in the same white-on-scrim as the close control,
  // clear of the picture's edges and of each other on a phone.
  const roundClass =
    'grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur-[4px] transition-colors hover:bg-white/30 disabled:opacity-30 disabled:hover:bg-white/15';
  const stepClass = `${roundClass} absolute top-1/2 z-20 -translate-y-1/2`;

  return (
    // The backdrop is the third way out. It is a button so that it has a name
    // and a keyboard, not a div with an onClick.
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      // The count is the picture's own name, so it is not said twice on the
      // way in.
      aria-label={title}
      // touch-none: every touch in here is the viewer's, not the page's.
      className="fixed inset-0 z-50 grid touch-none place-items-center overflow-hidden bg-[#0A1D36]/92 p-3"
      onTouchStart={(event) => {
        if (event.touches.length > 1) {
          pinched.current = true;
          return;
        }
        pinched.current = false;
        const t = event.touches[0];
        touch.current = t ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(event) => {
        const start = touch.current;
        const t = event.changedTouches[0];
        if (event.touches.length > 0) return;
        touch.current = null;
        // Zoomed, a drag moves round the picture; a pinch is never a swipe.
        if (!start || !t || pinched.current || isZoomed(zoomRef.current)) return;
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
        if (dx < 0 && hasNext) onStep(index + 1);
        if (dx > 0 && hasPrevious) onStep(index - 1);
      }}
    >
      <button
        type="button"
        aria-label="Close the photograph"
        onClick={onClose}
        tabIndex={-1}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <img
        // Keyed on the URL so a new photograph is a new element and takes
        // focus again, and so the old one is not shown stretched while the
        // next loads.
        key={url}
        src={url}
        alt={label}
        // Above the backdrop button, and focusable so Escape has somewhere to
        // land and a screen reader lands on the picture rather than on the
        // close control behind it.
        className={`relative z-10 max-h-[92dvh] max-w-full select-none rounded-[8px] object-contain shadow-[0_18px_48px_rgba(0,0,0,.5)] ${
          gesturing ? '' : 'transition-transform duration-200 motion-reduce:transition-none'
        } ${isZoomed(zoom) ? 'cursor-grab' : 'cursor-zoom-in'}`}
        style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` }}
        draggable={false}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        // The hook focuses the first picture; a step brings a new element,
        // which takes focus here.
        ref={(element) => {
          picture.current = element;
          element?.focus();
        }}
        tabIndex={-1}
      />
      <button
        type="button"
        aria-label="Close the photograph"
        onClick={onClose}
        className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-20 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur-[4px] transition-colors hover:bg-white/30"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
      <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-3">
        <button
          type="button"
          aria-label="Zoom out"
          disabled={!isZoomed(zoom)}
          onClick={() => {
            zoomBy(1 / STEP);
          }}
          className={roundClass}
        >
          <Minus className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={zoom.scale >= MAX_SCALE}
          onClick={() => {
            zoomBy(isZoomed(zoom) ? STEP : TAP_SCALE);
          }}
          className={roundClass}
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      {count > 1 ? (
        <>
          <button
            type="button"
            aria-label="Previous photograph"
            disabled={!hasPrevious}
            onClick={() => {
              onStep(index - 1);
            }}
            className={`${stepClass} left-3`}
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next photograph"
            disabled={!hasNext}
            onClick={() => {
              onStep(index + 1);
            }}
            className={`${stepClass} right-3`}
          >
            <ChevronRight className="h-6 w-6" aria-hidden="true" />
          </button>
        </>
      ) : null}
    </div>
  );
}
