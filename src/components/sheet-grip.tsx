import { type PointerEvent, type RefObject, useRef } from 'react';
import { motionReduced } from '@/lib/accessibility';

/** Pixels of pull that close a sheet, or a quarter of it if it is short. */
const CLOSE_AT = 120;

/**
 * The bar at the top of a bottom sheet. It looks like something to pull, so it
 * is (the owner, 2026-11-01): the sheet follows the finger, and let go far
 * enough down it closes; otherwise it slides back. A phone's, as the bar is.
 *
 * A pointer's extra way out, and hidden from a screen reader: every sheet has a
 * Close, its backdrop and Escape. The map's sheet has its own, which minimizes
 * rather than closes (map-sheet.tsx).
 */
export function SheetGrip({
  sheet,
  onClose,
}: {
  sheet: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const start = useRef<number | null>(null);
  const pulled = useRef(0);

  const slideBack = () => {
    const element = sheet.current;
    start.current = null;
    pulled.current = 0;
    if (!element) return;
    element.style.transition = motionReduced() ? '' : 'transform 180ms ease-out';
    element.style.transform = '';
  };

  const onGrip = (event: PointerEvent<HTMLDivElement>) => {
    start.current = event.clientY;
    pulled.current = 0;
    if (sheet.current) sheet.current.style.transition = '';
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if (start.current === null || !sheet.current) return;
    // Down only: there is nothing above a sheet to pull it up to.
    pulled.current = Math.max(event.clientY - start.current, 0);
    sheet.current.style.transform = `translateY(${pulled.current}px)`;
  };
  const onLetGo = () => {
    if (start.current === null) return;
    const height = sheet.current?.offsetHeight ?? 0;
    if (pulled.current > 0 && pulled.current >= Math.min(CLOSE_AT, height / 4)) onClose();
    else slideBack();
  };

  return (
    <div
      aria-hidden="true"
      data-sheet-grip
      onPointerDown={onGrip}
      onPointerMove={onMove}
      onPointerUp={onLetGo}
      onPointerCancel={slideBack}
      className="flex h-8 w-full flex-none touch-none items-center justify-center lg:hidden"
    >
      <span className="h-[4.5px] w-[38px] rounded-[3px] bg-line" />
    </div>
  );
}
