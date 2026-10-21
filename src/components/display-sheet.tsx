import { ALargeSmall } from 'lucide-react';
import { createContext, useCallback, useContext, useId, useRef, useState } from 'react';
import { useDialogFocus } from '@/lib/dialog-focus';
import { cn } from '@/lib/utils';
import { DisplayControls } from '@/routes/me/accessibility-settings';

/**
 * The Display settings, one tap from the main screens (2026-10-20).
 *
 * The same controls as Me → Settings, in a sheet. Opened by a round button in
 * the headers of Home, Peers, Chat, Events and Me on a phone, by the top bar
 * on a desktop, and by a link beside "Skip to content" for a keyboard. Never a
 * floating button: one would sit over the Send button in a conversation (the
 * owner, 2026-10-20).
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

/**
 * The button. `round` sits in a screen's header beside its other round
 * buttons and is phone-only; `plate` is the same on Me's navy band; `bar` is
 * the desktop top bar's, drawn like the Notifications item next to it.
 */
export function DisplayButton({
  variant,
  className,
}: {
  variant: 'round' | 'plate' | 'bar';
  className?: string;
}) {
  const open = useOpenDisplaySheet();
  if (variant === 'bar') {
    return (
      <button
        type="button"
        onClick={open}
        className={cn(
          'relative flex items-center gap-2 rounded-xl px-3 py-1.5 font-bold text-[0.875rem] text-grey hover:bg-tint',
          className,
        )}
      >
        <span className="grid h-7 w-7 place-items-center rounded-[10px]">
          <ALargeSmall aria-hidden="true" className="h-[20px] w-[20px]" />
        </span>
        <span>Display</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Display settings"
      className={cn(
        'grid h-[44px] w-[44px] flex-none place-items-center rounded-full transition-colors md:hidden',
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
