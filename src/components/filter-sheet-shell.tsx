import { useEffect } from 'react';
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="Close filters"
        onClick={onClose}
        className="absolute inset-0 z-[70] bg-[rgba(10,20,35,.5)]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
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
            <h2 className="font-extrabold font-head text-[1.3125rem] tracking-[-0.02em]">
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
            className="min-h-[48px] rounded-xl bg-tint px-5 font-bold font-head text-[0.9375rem] text-navy disabled:opacity-40"
          >
            Clear{clearCount ? ` (${clearCount})` : ''}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] flex-1 rounded-xl bg-navy px-5 font-bold font-head text-[0.9375rem] text-white"
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
      className={cn(
        // Comfortably past the 24px WCAG minimum without turning the sheet into
        // a page of buttons.
        'min-h-[38px] rounded-full px-3 font-semibold text-[0.8125rem] leading-[1.25]',
        on ? 'bg-navy text-white' : 'border border-line bg-paper text-ink2',
      )}
    >
      {label}
    </button>
  );
}
