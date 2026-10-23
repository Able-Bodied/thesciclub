import { ALargeSmall } from 'lucide-react';
import { createContext, useCallback, useContext, useId, useRef, useState } from 'react';
import { useDialogFocus } from '@/lib/dialog-focus';
import { cn } from '@/lib/utils';
import { DisplayControls } from '@/routes/me/accessibility-settings';

/**
 * The Display settings, one tap from Me (2026-10-20), in a sheet: the same
 * controls as Me → Settings. Every other screen reaches it by the button beside
 * "Skip to content" for a keyboard. Only Me has the button since 2026-10-22
 * (the owner); never a floating one, which would cover Send in a conversation.
 */

const DisplaySheetContext = createContext<(() => void) | null>(null);

/** Holds the sheet. Inside the app shell, which the sheet is positioned in. */
export function DisplaySheetProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => {
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
  }, []);
  return (
    <DisplaySheetContext.Provider value={show}>
      {children}
      {open ? <DisplaySheet onClose={close} /> : null}
    </DisplaySheetContext.Provider>
  );
}

/** Opens the sheet. Does nothing outside a provider, as in a test. */
export function useOpenDisplaySheet(): () => void {
  return useContext(DisplaySheetContext) ?? noop;
}

function noop() {
  // No sheet to open.
}

/** The button: `round` on a light header, `plate` on Me's navy band. */
export function DisplayButton({
  variant,
  className,
}: {
  variant: 'round' | 'plate';
  className?: string;
}) {
  const open = useOpenDisplaySheet();
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Display settings"
      className={cn(
        'grid h-[44px] w-[44px] flex-none place-items-center rounded-full transition-colors',
        variant === 'round'
          ? 'bg-tint text-emphasis hover:bg-line'
          : 'bg-plate-chip text-white hover:bg-plate-hover',
        className,
      )}
    >
      <ALargeSmall aria-hidden="true" className="h-[20px] w-[20px]" strokeWidth={2} />
    </button>
  );
}

/** A bottom sheet on a phone and a centred panel on a desktop, as Filters is. */
function DisplaySheet({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);

  useDialogFocus(dialog, heading, onClose);

  return (
    <>
      <button
        type="button"
        aria-label="Close display settings"
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
          'absolute z-[71] flex flex-col bg-canvas',
          'inset-x-0 bottom-0 max-h-[88%] rounded-t-3xl shadow-[0_-14px_40px_rgba(10,20,35,.3)]',
          'lg:inset-x-auto lg:bottom-auto lg:top-1/2 lg:left-1/2 lg:max-h-[82%] lg:w-[560px]',
          'lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl',
          'lg:shadow-[0_24px_60px_rgba(10,20,35,.35)]',
        )}
      >
        <div className="mx-auto mt-2.5 mb-1 h-[4.5px] w-[38px] flex-none rounded-[3px] bg-line lg:hidden" />

        <div className="flex flex-none items-start justify-between gap-3 px-[18px] pt-1 lg:pt-5">
          <div className="min-w-0">
            <h2
              id={titleId}
              ref={heading}
              tabIndex={-1}
              className="font-extrabold font-head text-[1.3125rem] tracking-[-0.01em] outline-none"
            >
              Display
            </h2>
            <p className="mt-0.5 text-[0.8125rem] text-ink2">
              These apply to this phone or computer only.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="hidden h-11 w-11 flex-none place-items-center rounded-full bg-tint font-bold text-[1.0625rem] text-emphasis lg:grid"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 flex-1 overflow-y-auto px-[18px] pb-2">
          <DisplayControls />
        </div>

        <div className="flex flex-none border-line border-t px-[18px] pt-3 pb-6 lg:pb-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] flex-1 rounded-xl bg-action px-5 font-bold font-head text-[0.9375rem] text-white transition-colors hover:bg-action-hi"
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}
