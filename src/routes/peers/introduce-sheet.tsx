import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAnnounce } from '@/lib/announce';
import { useDialogFocus } from '@/lib/dialog-focus';
import { cn } from '@/lib/utils';
import { ConnectFields, ConnectMissing, useConnectForm } from '@/routes/peers/connect-form';

/**
 * An org admin or a partner introduces the member whose profile this is to
 * one or more others, in a new group or one they have (20261106020000). The
 * geometry and the ways out are BlockSheet's.
 */
export function IntroduceSheet({
  member,
  onCancel,
  onSent,
}: {
  member: { id: string; displayName: string };
  onCancel: () => void;
  onSent: () => void;
}) {
  const announce = useAnnounce();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  useDialogFocus(dialog, heading, onCancel);
  const form = useConnectForm(member);

  function send() {
    void form.submit().then((done) => {
      if (!done) return;
      announce(done.summary);
      onSent();
    });
  }

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close without introducing"
        tabIndex={-1}
        onClick={onCancel}
        className="fixed inset-0 z-[80] bg-[rgba(10,20,35,.5)]"
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'fixed z-[81] flex flex-col bg-paper text-ink',
          'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-3xl shadow-[0_-14px_40px_rgba(10,20,35,.3)]',
          'lg:inset-x-auto lg:bottom-auto lg:top-1/2 lg:left-1/2 lg:max-h-[82dvh] lg:w-[520px]',
          'lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl',
        )}
      >
        <div className="flex-1 overflow-y-auto px-[18px] pt-5 pb-4">
          <h2
            id={titleId}
            ref={heading}
            tabIndex={-1}
            className="font-extrabold font-head text-[1.3125rem] text-ink tracking-[-0.01em] outline-none"
          >
            Introduce {member.displayName}
          </h2>
          <p className="mt-1.5 text-[0.9375rem] text-ink2 leading-[1.5]">
            Everyone is added to a group conversation right away, and told you connected them.
            Anybody in it can leave.
          </p>
          <ConnectFields form={form} />
        </div>
        <div className="flex-none border-line border-t px-[18px] pt-3 pb-6 lg:pb-4">
          <ConnectMissing form={form} className="mb-2" />
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[48px] rounded-xl bg-tint px-5 font-bold font-head text-[0.9375rem] text-emphasis transition-colors hover:bg-line"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={send}
              disabled={form.busy || form.missing !== null}
              className="min-h-[48px] flex-1 rounded-xl bg-action px-5 font-bold font-head text-[0.9375rem] text-white transition-colors disabled:opacity-40"
            >
              {form.actionLabel}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
