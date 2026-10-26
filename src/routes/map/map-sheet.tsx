import { useId, useRef } from 'react';
import { useDialogFocus } from '@/lib/dialog-focus';
import { cn } from '@/lib/utils';

/**
 * What is at a place on the map. On a phone a bottom sheet over the lower part
 * of the map, for a thumb; on a wide screen a panel down the left, so the map
 * stays in view and another pin can be tapped. Focus as every sheet
 * (useDialogFocus); the backdrop, ✕ and Escape close it.
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

  return (
    <>
      <button
        type="button"
        aria-label="Back to the map"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 z-[20] bg-[rgba(10,20,35,.35)] lg:hidden"
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'absolute z-[21] flex flex-col bg-canvas',
          'inset-x-0 bottom-0 max-h-[85%] rounded-t-3xl shadow-[0_-14px_40px_rgba(10,20,35,.3)]',
          'lg:top-3 lg:right-auto lg:bottom-10 lg:left-3 lg:max-h-none lg:w-[420px] lg:rounded-3xl',
          'lg:shadow-[0_18px_50px_rgba(10,20,35,.3)]',
        )}
      >
        <div className="mx-auto mt-2.5 mb-1 h-[4.5px] w-[38px] flex-none rounded-[3px] bg-line lg:hidden" />
        <div className="flex flex-none items-start justify-between gap-3 px-[18px] pt-1 pb-2 lg:pt-4">
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
        <div className="flex-1 overflow-y-auto px-4 pt-1 pb-6">{children}</div>
      </div>
    </>
  );
}
