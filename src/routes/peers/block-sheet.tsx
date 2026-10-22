import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnnounce } from '@/lib/announce';
import { blockExplainer, blockMember } from '@/lib/blocks';
import { describeThrown } from '@/lib/describe-error';
import { useDialogFocus } from '@/lib/dialog-focus';
import { cn } from '@/lib/utils';

/**
 * Asks before blocking, and says plainly what blocking does. The geometry and
 * the ways out are ReportSheet's; fixed, as it opens over a whole page.
 */
export function BlockSheet({
  name,
  onCancel,
  onBlock,
}: {
  name: string;
  onCancel: () => void;
  /** Resolves to null on success, or to a sentence to show. */
  onBlock: () => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const titleId = useId();
  const dialog = useRef<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  useDialogFocus(dialog, heading, onCancel);

  function block() {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    onBlock()
      .then((said) => {
        if (said) setFailure(said);
      })
      .catch((e: unknown) => {
        setFailure(describeThrown(e, 'That did not work.'));
      })
      .finally(() => {
        setBusy(false);
      });
  }

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close without blocking"
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
        <div className="flex-1 overflow-y-auto px-[18px] pt-5">
          <h2
            id={titleId}
            ref={heading}
            tabIndex={-1}
            className="font-extrabold font-head text-[1.3125rem] text-ink tracking-[-0.01em] outline-none"
          >
            Block {name}?
          </h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[0.9375rem] text-ink2 leading-[1.5]">
            {blockExplainer(name).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {failure ? (
            <p
              role="alert"
              className="mt-3 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.875rem] text-destructive leading-[1.45]"
            >
              {failure}
            </p>
          ) : null}
        </div>
        <div className="flex flex-none flex-wrap items-center gap-2.5 border-line border-t px-[18px] pt-3 pb-6 lg:pb-4">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[48px] rounded-xl bg-tint px-5 font-bold font-head text-[0.9375rem] text-emphasis transition-colors hover:bg-line"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={block}
            disabled={busy}
            className="min-h-[48px] flex-1 rounded-xl bg-destructive-fill px-5 font-bold font-head text-[0.9375rem] text-white transition-colors disabled:opacity-40"
          >
            {busy ? 'Blocking…' : `Block ${name}`}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

/**
 * BlockSheet that does the block and says so: one for a profile's ••• and a
 * message's or post's, so the two cannot drift.
 */
export function BlockMemberSheet({
  memberId,
  name,
  onCancel,
  onBlocked,
}: {
  memberId: string;
  name: string;
  onCancel: () => void;
  onBlocked: () => void;
}) {
  const announce = useAnnounce();
  return (
    <BlockSheet
      name={name}
      onCancel={onCancel}
      onBlock={async () => {
        const result = await blockMember(memberId);
        if (!result.ok) return result.error;
        announce(`You blocked ${name}.`);
        onBlocked();
        return null;
      }}
    />
  );
}
