import { type CSSProperties, type PointerEvent, useId, useRef, useState } from 'react';
import { useDialogFocus } from '@/lib/dialog-focus';
import { cn } from '@/lib/utils';

/** Pixels a finger moves before it is a drag and not a tap. */
const MOVED = 6;

/**
 * What is at a place on the map. On a phone a bottom sheet over the lower part
 * of the map, for a thumb; on a wide screen a panel down the left, so the map
 * stays in view and another pin can be tapped. Focus as every sheet
 * (useDialogFocus); the backdrop, ✕ and Escape close it.
 *
 * On a phone its handle drags it down to its title, or a tap does (the owner,
 * 2026-11-01): the map is free then, with no backdrop, and the handle brings it
 * back. A button, so a keyboard and a screen reader can do what a drag does.
 */
export function MapSheet({
  title,
  subtitle,
  action,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  /** Beside the title, such as "Zoom in here". */
  action?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  useDialogFocus(dialog, heading, onClose);

  const top = useRef<HTMLDivElement | null>(null);
  const [down, setDown] = useState(false);
  /** The height left showing when down, measured as it goes. */
  const [showing, setShowing] = useState(0);
  /** Pixels below its open place while a finger holds the handle. */
  const [held, setHeld] = useState<number | null>(null);
  const grip = useRef<{ y: number; from: number; range: number; moved: boolean } | null>(null);
  const dragged = useRef(false);

  const settle = (next: boolean) => {
    setShowing(top.current?.offsetHeight ?? 0);
    setDown(next);
  };

  const onGrip = (event: PointerEvent<HTMLDivElement>) => {
    dragged.current = false;
    // The title's strip is held too, all but what has a tap of its own.
    const target = event.target as Element;
    if (target.closest('a, button:not([data-handle])')) return;
    const range = (dialog.current?.offsetHeight ?? 0) - (top.current?.offsetHeight ?? 0);
    grip.current = { y: event.clientY, from: down ? range : 0, range, moved: false };
    // The handle waits for onDrag: captured now, a tap's click would miss it.
    if (!target.closest('[data-handle]')) event.currentTarget.setPointerCapture(event.pointerId);
  };
  const place = (held: typeof grip.current, y: number) =>
    held ? Math.min(Math.max(held.from + y - held.y, 0), held.range) : 0;
  const onDrag = (event: PointerEvent<HTMLDivElement>) => {
    const held = grip.current;
    if (!held) return;
    if (!held.moved && Math.abs(event.clientY - held.y) < MOVED) return;
    if (!held.moved) event.currentTarget.setPointerCapture(event.pointerId);
    held.moved = true;
    setHeld(place(held, event.clientY));
  };
  const onLetGo = (event: PointerEvent<HTMLDivElement>) => {
    const held = grip.current;
    grip.current = null;
    if (!held?.moved) return;
    dragged.current = true;
    setHeld(null);
    // A quarter of the way from where it was is enough, either way.
    settle(place(held, event.clientY) > held.range * (down ? 0.75 : 0.25));
  };

  const offset = held !== null ? `${held}px` : down ? `calc(100% - ${showing}px)` : '0px';

  return (
    <>
      {down ? null : (
        <button
          type="button"
          aria-label="Back to the map"
          tabIndex={-1}
          onClick={onClose}
          className="absolute inset-0 z-[20] bg-[rgba(10,20,35,.35)] lg:hidden"
        />
      )}
      <div
        ref={dialog}
        role="dialog"
        aria-modal={!down}
        aria-labelledby={titleId}
        style={{ '--sheet-down': offset } as CSSProperties}
        className={cn(
          'absolute z-[21] flex flex-col bg-canvas',
          'inset-x-0 bottom-0 max-h-[85%] rounded-t-3xl shadow-[0_-14px_40px_rgba(10,20,35,.3)]',
          'max-lg:[transform:translateY(var(--sheet-down))]',
          held === null && 'max-lg:transition-transform motion-reduce:transition-none',
          'lg:top-3 lg:right-auto lg:bottom-10 lg:left-3 lg:max-h-none lg:w-[420px] lg:rounded-3xl',
          'lg:shadow-[0_18px_50px_rgba(10,20,35,.3)]',
        )}
      >
        <div
          ref={top}
          onPointerDown={onGrip}
          onPointerMove={onDrag}
          onPointerUp={onLetGo}
          onPointerCancel={() => {
            grip.current = null;
            setHeld(null);
          }}
          className="flex-none max-lg:touch-none max-lg:select-none"
        >
          <button
            type="button"
            data-handle
            aria-label={down ? 'Show all of this' : 'Minimize'}
            aria-expanded={!down}
            onClick={() => {
              if (!dragged.current) settle(!down);
              dragged.current = false;
            }}
            className="-mb-2 flex h-11 w-full items-center justify-center lg:hidden"
          >
            <span aria-hidden="true" className="h-[4.5px] w-[38px] rounded-[3px] bg-line" />
          </button>
          <div className="relative flex items-start justify-between gap-3 px-[18px] pt-1 pb-2 lg:pt-4">
            <div className="min-w-0">
              <h2
                id={titleId}
                ref={heading}
                tabIndex={-1}
                className="font-extrabold font-head text-[1.1875rem] text-ink tracking-[-0.01em] outline-none"
              >
                {title}
              </h2>
              {subtitle ? <p className="mt-0.5 text-[0.8125rem] text-ink2">{subtitle}</p> : null}
              {action}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-11 w-11 flex-none place-items-center rounded-full bg-tint font-bold text-[1.0625rem] text-emphasis hover:bg-line"
            >
              ✕
            </button>
          </div>
        </div>
        <div inert={down} className="flex-1 overflow-y-auto px-4 pt-1 pb-6">
          {children}
        </div>
      </div>
    </>
  );
}
