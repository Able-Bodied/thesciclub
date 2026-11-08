import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '@/lib/dialog-focus';
import { askFamilyLink, RELATION_CHOICES, RELATIONS, type Relation } from '@/lib/family';
import { cn } from '@/lib/utils';

/**
 * "Ana is my…": asks to link a member as family (src/lib/family.ts). The
 * geometry and the ways out are BlockSheet's.
 */
export function FamilySheet({
  memberId,
  name,
  onCancel,
  onSent,
}: {
  memberId: string;
  name: string;
  onCancel: () => void;
  onSent: () => void;
}) {
  const [relation, setRelation] = useState<Relation | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const titleId = useId();
  const dialog = useRef<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  useDialogFocus(dialog, heading, onCancel);

  function send() {
    if (busy || !relation) return;
    setBusy(true);
    setFailure(null);
    void askFamilyLink(memberId, relation).then((result) => {
      setBusy(false);
      if (result.ok) onSent();
      else setFailure(result.error);
    });
  }

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close without asking"
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
            Link {name} as family
          </h2>
          <p className="mt-2 text-[0.9375rem] text-ink2 leading-[1.5]">
            {name} is asked first. Once they say yes, members see you as family on both of your
            profiles. Either of you can remove it at any time.
          </p>
          <fieldset className="mt-4">
            <legend className="mb-2 font-bold text-[0.9375rem] text-ink">{name} is my…</legend>
            <div className="flex flex-col gap-2">
              {RELATIONS.map((value) => (
                <label
                  key={value}
                  className={cn(
                    'flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border px-3.5 text-[0.9375rem]',
                    relation === value ? 'border-emphasis bg-tint' : 'border-line',
                  )}
                >
                  <input
                    type="radio"
                    name="relation"
                    value={value}
                    checked={relation === value}
                    onChange={() => {
                      setRelation(value);
                    }}
                    className="h-5 w-5 accent-[var(--color-action)]"
                  />
                  {RELATION_CHOICES[value]}
                </label>
              ))}
            </div>
          </fieldset>
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
            onClick={send}
            disabled={busy || !relation}
            className="min-h-[48px] flex-1 rounded-xl bg-action px-5 font-bold font-head text-[0.9375rem] text-white transition-colors disabled:opacity-40"
          >
            {busy ? 'Asking…' : `Ask ${name}`}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
