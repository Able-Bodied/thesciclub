import { MoreHorizontal } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '@/lib/dialog-focus';

/** One visible target keeps message actions discoverable without a row of
 * controls under every bubble. The sheet also works with a keyboard or pointer. */
export function ItemActions({ what, children }: { what: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={`Actions for ${what}`}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
        }}
        className="relative grid h-11 w-11 flex-none place-items-center rounded-full text-grey hover:bg-tint"
      >
        <MoreHorizontal aria-hidden="true" className="h-5 w-5" />
      </button>
      {open
        ? createPortal(
            <ActionsSheet
              what={what}
              onClose={() => {
                setOpen(false);
              }}
            >
              {children}
            </ActionsSheet>,
            document.body,
          )
        : null}
    </>
  );
}

function ActionsSheet({
  what,
  children,
  onClose,
}: {
  what: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useDialogFocus(dialog, heading, onClose);
  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close message actions"
        onClick={onClose}
        className="fixed inset-0 z-[80] bg-black/40"
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={`Actions for ${what}`}
        className="fixed inset-x-0 bottom-0 z-[81] max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-paper p-5 text-ink shadow-xl md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-[360px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl"
      >
        <h2 ref={heading} tabIndex={-1} className="font-bold font-head text-lg outline-none">
          Message actions
        </h2>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: Delegates activation from actual child buttons. */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: Keyboard button activation dispatches the same click. */}
        <div
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest('button')) onClose();
          }}
          className="mt-3 [&_button]:min-h-11 [&_button]:w-full [&_button]:justify-start [&_button]:rounded-lg [&_button]:px-3 [&_button]:text-left [&_button]:text-sm [&_button]:no-underline [&_button]:hover:bg-tint [&_div]:flex-col [&_div]:items-stretch"
        >
          {children}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 min-h-12 w-full rounded-xl border border-line font-semibold"
        >
          Done
        </button>
      </div>
    </>
  );
}
