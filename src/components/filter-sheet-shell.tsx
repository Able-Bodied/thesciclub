import { useId, useRef } from 'react';
import { SheetGrip } from '@/components/sheet-grip';
import { useDialogFocus } from '@/lib/dialog-focus';
import { cn } from '@/lib/utils';

/**
 * The frame both filter sheets (Peers, Events) sit in.
 *
 * On a wide screen a centred panel, not full width: full width put "Show 52" about 1000px from
 * the chip just tapped, the whole interaction for a trackball, head pointer or mouth stick. A
 * bottom sheet on a phone.
 *
 * Three ways out (close button, backdrop, Escape), so keyboard and switch users are never trapped.
 * `useDialogFocus` (`src/lib/dialog-focus.ts`) moves focus to the title, keeps Tab inside, and
 * returns it on close; without it the first chip on Home was 85 Tabs away (fixed 2026-09-30).
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

  useDialogFocus(dialog, heading, onClose);

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
        <SheetGrip sheet={dialog} onClose={onClose} />

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
          {/* At every width: hidden below `lg`, a narrow desktop window had no way out in
              sight (the owner, 2026-11-01). "Close", not the backdrop's "Close filters": a
              repeated accessible name reads as one control to a screen reader. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-11 w-11 flex-none place-items-center rounded-full bg-tint font-bold text-[1.0625rem] text-emphasis"
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
            // Sized to its text: Clear is the rarer action.
            className="min-h-[48px] rounded-xl bg-tint px-5 font-bold font-head text-[0.9375rem] text-emphasis transition-colors hover:bg-line disabled:opacity-40 disabled:hover:bg-tint"
          >
            Clear{clearCount ? ` (${clearCount})` : ''}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] flex-1 rounded-xl bg-action px-5 font-bold font-head text-[0.9375rem] text-white transition-colors hover:bg-action-hi"
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
  icon: Icon,
  leading,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  /** Beside the label, to tell chips apart at a glance (the owner, 2026-11-03). */
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /** Drawn before the label instead of an icon, such as a type's badge. */
  leading?: React.ReactNode;
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
        (Icon !== undefined || leading !== undefined) && 'inline-flex items-center gap-1.5',
        on
          ? 'bg-action text-white hover:bg-action-hi'
          : 'border border-line bg-paper text-ink2 hover:bg-tint',
      )}
    >
      {Icon ? <Icon className="h-[15px] w-[15px] flex-none" aria-hidden={true} /> : leading}
      {label}
    </button>
  );
}
