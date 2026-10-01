import { useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * The frame both filter sheets sit in.
 *
 * Extracted because Peers and Events had drifted into two copies of the same
 * dialog, and the fix below needed applying to both.
 *
 * ---------------------------------------------------------------------------
 * Why it stops being full width
 * ---------------------------------------------------------------------------
 * It used to span the shell — 1280px on a desktop — with the chips packed into
 * the left third and an empty right two-thirds. That is expensive in the one
 * way this app cannot afford: "Show 52" sat about a thousand pixels from the
 * chip somebody had just tapped, so applying a filter meant dragging the
 * pointer the full width of the screen and back. For a member driving a
 * trackball, a head pointer or a mouth stick, that is the whole interaction.
 *
 * So on a wide screen it is a centred panel rather than a full-bleed sheet, and
 * the footer buttons are sized to their text instead of stretching. On a phone
 * it stays a bottom sheet, because that is the right shape for a thumb and the
 * width problem does not exist there.
 *
 * ---------------------------------------------------------------------------
 * Three ways out
 * ---------------------------------------------------------------------------
 * The close button, the backdrop and Escape. A sheet dismissable only by a tap
 * on one specific region is a trap for anybody navigating by keyboard or
 * switch.
 *
 * ---------------------------------------------------------------------------
 * Focus goes in, stays in, and comes back
 * ---------------------------------------------------------------------------
 * The likes list's rules (`src/routes/chat/like-button.tsx`), the photograph
 * viewer's before it. On open, focus moves to the title, so a screen reader
 * says which sheet this is and the next Tab is its first chip. Tab and
 * Shift+Tab go round the sheet's own buttons. On close, focus goes back to
 * whatever had it before, which is the Filters button.
 *
 * Until 2026-09-30 it did none of this: `aria-modal` said the page behind was
 * out of reach, focus stayed on the Filters button behind the backdrop, and
 * the first chip on Home was 85 presses of Tab away, through the whole feed.
 *
 * The shell puts focus back itself, on unmount, rather than asking each
 * screen for a ref to its button: three screens open it, and a rule each one
 * has to remember is a rule one of them forgets.
 */

export interface FilterSheetShellProps {
  title: string;
  /** Live count, so the effect of a chip is visible before the sheet closes. */
  summary: string;
  onClose: () => void;
  onClear: () => void;
  clearCount: number;
  applyLabel: string;
  children: React.ReactNode;
}

export function FilterSheetShell({
  title,
  summary,
  onClose,
  onClear,
  clearCount,
  applyLabel,
  children,
}: FilterSheetShellProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    // Read before anything moves it: this is what opened the sheet.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    heading.current?.focus();
    return () => {
      // Only if it is still on the page. A sheet closed by leaving the screen
      // has nothing to go back to.
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'Tab') keepFocusInside(event);
    }
    // On the window, so focus that has somehow left the sheet still comes
    // back. The title is not in the Tab order, so Shift+Tab from it goes to
    // the last control. Clear is skipped while it is disabled.
    function keepFocusInside(event: KeyboardEvent) {
      const root = dialog.current;
      if (!root) return;
      // Not the panel's Close on a phone, where it is `hidden`: a hidden
      // control cannot take focus, and the loop would end on nothing.
      const controls = [
        ...root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]):not([tabindex="-1"])',
        ),
      ].filter((control) => getComputedStyle(control).display !== 'none');
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      const at = controls.findIndex((control) => control === document.activeElement);
      if (event.shiftKey && at <= 0) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (at === controls.length - 1 || !root.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <>
      {/* Out of the Tab order, as the likes list's backdrop is: it is there for
          a pointer, and a keyboard has Escape and the buttons in the sheet. */}
      <button
        type="button"
        aria-label="Close filters"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 z-[70] bg-[rgba(10,20,35,.5)]"
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'absolute z-[71] flex flex-col bg-paper',
          // Phone: a bottom sheet, full width, rounded at the top.
          'inset-x-0 bottom-0 max-h-[88%] rounded-t-3xl shadow-[0_-14px_40px_rgba(10,20,35,.3)]',
          // Wide: a centred panel. Everything stays within one short movement.
          'lg:inset-x-auto lg:bottom-auto lg:top-1/2 lg:left-1/2 lg:max-h-[82%] lg:w-[560px]',
          'lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl',
          'lg:shadow-[0_24px_60px_rgba(10,20,35,.35)]',
        )}
      >
        {/* The grab handle is a phone affordance and reads as noise on a panel. */}
        <div className="mx-auto mt-2.5 mb-1 h-[4.5px] w-[38px] flex-none rounded-[3px] bg-line lg:hidden" />

        <div className="flex flex-none items-start justify-between gap-3 px-[18px] pt-1 lg:pt-5">
          <div className="min-w-0">
            <h2
              id={titleId}
              ref={heading}
              tabIndex={-1}
              className="font-extrabold font-head text-[1.3125rem] tracking-[-0.01em] outline-none"
            >
              {title}
            </h2>
            <p className="mt-0.5 text-[0.78125rem] text-grey">{summary}</p>
          </div>
          {/* A second way out, at the top where a panel's close button belongs.
              Hidden on a phone, where the handle and the backdrop do the job and
              the header is tighter.

              Named "Close" rather than "Close filters", which is the backdrop's
              name: two controls with the same accessible name read as one
              repeated control to a screen reader, and these are in different
              places. Filters apply as they are tapped, so nothing is lost or
              confirmed by either — both just dismiss. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="hidden h-11 w-11 flex-none place-items-center rounded-full bg-tint font-bold text-[1.0625rem] text-navy lg:grid"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 flex-1 overflow-y-auto px-[18px]">{children}</div>

        <div className="flex flex-none items-center justify-between gap-2.5 border-line border-t px-[18px] pt-3 pb-6 lg:pb-4">
          <button
            type="button"
            onClick={onClear}
            disabled={clearCount === 0}
            // Sized to its text rather than to half the sheet: Clear is the
            // rarer action and should not be half the target area.
            className="min-h-[48px] rounded-xl bg-tint px-5 font-bold font-head text-[0.9375rem] text-navy transition-colors hover:bg-line disabled:opacity-40 disabled:hover:bg-tint"
          >
            Clear{clearCount ? ` (${clearCount})` : ''}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] flex-1 rounded-xl bg-navy px-5 font-bold font-head text-[0.9375rem] text-white transition-colors hover:bg-navy-hi"
          >
            {applyLabel}
          </button>
        </div>
      </div>
    </>
  );
}

/** A labelled group of chips, in the shape both sheets use. */
export function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 break-inside-avoid">
      <h3 className="mb-2 font-extrabold font-head text-[0.71875rem] text-grey uppercase tracking-[0.13em]">
        {title}
      </h3>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </section>
  );
}

/** One chip. Pressed state is `aria-pressed`, not colour alone. */
export function FilterChip({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      data-target="small"
      className={cn(
        // Comfortably past the 24px WCAG minimum without turning the sheet into
        // a page of buttons.
        'min-h-[38px] rounded-full px-3 font-semibold text-[0.8125rem] leading-[1.25]',
        'transition-colors',
        on
          ? 'bg-navy text-white hover:bg-navy-hi'
          : 'border border-line bg-paper text-ink2 hover:bg-tint',
      )}
    >
      {label}
    </button>
  );
}
