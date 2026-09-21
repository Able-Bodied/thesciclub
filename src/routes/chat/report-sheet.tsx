import { useEffect, useState } from 'react';
import { REPORT_NOTE_MAX, reportNoteProblem, reportPreamble } from '@/lib/chat/reports';
import { cn } from '@/lib/utils';

/**
 * The sheet that asks whether to hand one post, or one message, over.
 *
 * ---------------------------------------------------------------------------
 * It says what happens before it happens
 * ---------------------------------------------------------------------------
 * The paragraph at the top is the whole reason this is a sheet and not a
 * one-tap control. Reporting somebody is not undoable and not private from the
 * person reporting's point of view — their name goes with it — and a member
 * deciding whether to make a complaint about harassment is owed the shape of
 * what they are about to do before they do it, not a toast afterwards.
 *
 * The sentence itself lives in `reportPreamble` in reports.ts, tested there,
 * because it is a promise about what the club does with somebody's words and
 * the only copy of it should not be a JSX string.
 *
 * ---------------------------------------------------------------------------
 * A sibling of FilterSheetShell, not a use of it
 * ---------------------------------------------------------------------------
 * CHAT-PLAN.md offered the shell "if it fits". It does not: its footer is
 * Clear and Apply over a live count, and its whole model is that the filters
 * have already taken effect by the time it closes. This one has a Send and a
 * Cancel, and nothing has happened until Send. Bending the shell to hold both
 * would leave one caller passing a `clearCount` that means nothing.
 *
 * What is copied deliberately is the geometry and the three ways out — the
 * close control, the backdrop and Escape. A sheet dismissable only by one tap
 * on one region is a trap for anybody on a keyboard or a switch, and on a wide
 * screen a full-bleed sheet puts Send a thousand pixels from the note somebody
 * just typed, which for a member driving a mouth stick is the interaction.
 *
 * ---------------------------------------------------------------------------
 * The note is optional and the words are kept
 * ---------------------------------------------------------------------------
 * The snapshot is the report; the note is whatever the reporter wants to add,
 * and demanding one from somebody describing something that happened to them
 * is a toll. On a failure the sheet stays open with what they wrote still in
 * it — the same rule the composer follows, and for the same reason.
 */
export function ReportSheet({
  kind,
  onCancel,
  onSend,
}: {
  kind: 'post' | 'message';
  onCancel: () => void;
  /** Resolves to null on success, or to a sentence to show. */
  onSend: (note: string) => Promise<string | null>;
}) {
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onCancel]);

  const noun = kind === 'post' ? 'post' : 'message';
  const title = `Report this ${noun}`;
  const problem = reportNoteProblem(note);

  function send() {
    if (sending || problem) return;
    setSending(true);
    setFailure(null);
    void onSend(note.trim())
      .then((said) => {
        if (said) setFailure(said);
      })
      .catch((e: unknown) => {
        setFailure(e instanceof Error ? e.message : 'That did not work.');
      })
      .finally(() => {
        setSending(false);
      });
  }

  return (
    <>
      {/* Named for what it does, and not "Cancel", which is the footer
          button's name. Two controls with the same accessible name read as one
          repeated control to a screen reader, and these are a screen apart. */}
      <button
        type="button"
        aria-label="Close without reporting"
        onClick={onCancel}
        className="absolute inset-0 z-[70] bg-[rgba(10,20,35,.5)]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'absolute z-[71] flex flex-col bg-paper',
          'inset-x-0 bottom-0 max-h-[88%] rounded-t-3xl shadow-[0_-14px_40px_rgba(10,20,35,.3)]',
          'lg:inset-x-auto lg:bottom-auto lg:top-1/2 lg:left-1/2 lg:max-h-[82%] lg:w-[520px]',
          'lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl',
          'lg:shadow-[0_24px_60px_rgba(10,20,35,.35)]',
        )}
      >
        {/* A phone affordance; noise on a panel. */}
        <div className="mx-auto mt-2.5 mb-1 h-[4.5px] w-[38px] flex-none rounded-[3px] bg-line lg:hidden" />

        <div className="flex-1 overflow-y-auto px-[18px] pt-1 lg:pt-5">
          <h2 className="font-extrabold font-head text-[1.3125rem] text-ink tracking-[-0.02em]">
            {title}
          </h2>
          {/* The promise, from reports.ts. Not written here. */}
          <p className="mt-2 text-[0.84375rem] text-ink2 leading-[1.55]">{reportPreamble(kind)}</p>

          <label
            htmlFor="report-note"
            className="mt-4 block font-extrabold font-head text-[0.71875rem] text-grey uppercase tracking-[0.13em]"
          >
            Anything to add
          </label>
          <p className="mt-1 text-[0.75rem] text-grey leading-[1.45]">
            Optional. The {noun} itself goes either way.
          </p>
          <textarea
            id="report-note"
            value={note}
            rows={3}
            maxLength={REPORT_NOTE_MAX}
            placeholder="What made you report it"
            onChange={(event) => {
              setNote(event.target.value);
            }}
            // Sized in em, so the box grows with the text rather than clipping
            // it at the larger text sizes.
            className="mt-2 min-h-[5em] w-full resize-y rounded-[13px] border-[1.6px] border-line bg-canvas px-[13px] py-[10px] text-[0.9375rem] text-ink leading-[1.45] outline-none focus:border-navy focus:bg-paper"
          />
          {problem ? (
            <p className="mt-1.5 text-[0.75rem] text-destructive leading-[1.45]">{problem}</p>
          ) : null}

          {failure ? (
            <p className="mt-3 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]">
              {failure} Nothing has been sent, and your words are still here.
            </p>
          ) : null}
        </div>

        <div className="flex flex-none items-center justify-between gap-2.5 border-line border-t px-[18px] pt-3 pb-6 lg:pb-4">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[48px] rounded-xl bg-tint px-5 font-bold font-head text-[0.9375rem] text-navy transition-colors hover:bg-line"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={send}
            disabled={sending || problem !== null}
            className="min-h-[48px] flex-1 rounded-xl bg-navy px-5 font-bold font-head text-[0.9375rem] text-white transition-colors hover:bg-navy-hi disabled:opacity-40"
          >
            {sending ? 'Sending…' : 'Send report'}
          </button>
        </div>
      </div>
    </>
  );
}
