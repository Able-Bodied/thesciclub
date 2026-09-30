import { SendHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PhotoPicker, PhotoStrip } from '@/routes/chat/photo-picker';

/**
 * The box at the foot of a topic or a thread — and, since 2026-09-29, the
 * editor of a post or a message, in place.
 *
 * ---------------------------------------------------------------------------
 * A textarea, not the mock's input
 * ---------------------------------------------------------------------------
 * The mock uses a one-line `<input>`. Members here dictate, and what they
 * dictate is paragraphs — a bowel programme, what happened in the first year,
 * how a chair was funded. A single line that scrolls sideways hides everything
 * somebody has just said into a phone, and the people most likely to be
 * dictating are the people least able to scroll back through it.
 *
 * So it grows with what is typed, up to a point, and then scrolls.
 *
 * ---------------------------------------------------------------------------
 * Why the height is scrollHeight *plus the border*, and why you cannot see it
 * ---------------------------------------------------------------------------
 * `scrollHeight` measures the content box. Tailwind's preflight makes every
 * element `border-box`, so a height of `scrollHeight` is short by the two
 * borders — the content no longer fits the box it was just measured for, the
 * textarea decides it is overflowing, and a one-line composer gets a scrollbar
 * in it. Measured in Chromium on the empty composer: the old line gave
 * `height: 44px` with `clientHeight` 42 against `scrollHeight` 44, overflowing
 * by exactly the border; the current one gives 46px, 44 against 44, and no
 * scrollbar.
 *
 * **The border is measured, not counted.** It is declared `border-[1.6px]` and
 * the browser reports a *used* width of 1px a side here, so 2px rather than
 * the 3.2px the stylesheet implies — and that rounding moves with the device
 * pixel ratio and the zoom. `offsetHeight - clientHeight` asks the browser the
 * same question the browser asks itself when it decides whether to draw a
 * scrollbar, which is the only number that can be right at every zoom.
 *
 * **It only shows on Windows**, which is why this note exists rather than a
 * one-word comment. macOS and iOS draw overlay scrollbars that take no space
 * and fade out, so the box looks perfect on the machine most of this was
 * looked at on. Windows and most Linux desktops draw a real one, and two
 * missing pixels are enough to summon it.
 *
 * `overflowY` is managed here for the same reason. It is `hidden` while the
 * box is still growing — there is nothing to scroll to, so a scrollbar there
 * is only a scrollbar — and `auto` once the box is at its maximum and the
 * words really do run past it. It is also set to `hidden` *before* measuring,
 * because a scrollbar that is already showing narrows the box, changes where
 * the text wraps, and inflates the `scrollHeight` the next height is computed
 * from.
 *
 * ---------------------------------------------------------------------------
 * Enter means different things in the two places
 * ---------------------------------------------------------------------------
 * `sendOnEnter` is true in a direct thread, where messages are short and Enter
 * is what everybody's hands already do, and false in a topic, where a post is
 * several paragraphs and Enter has to be a paragraph break. Shift+Enter is the
 * other one in both.
 *
 * The draft survives a failure. Losing four paragraphs to a dropped connection
 * is the one thing this control must never do, so the text is only cleared
 * after the write comes back.
 *
 * ---------------------------------------------------------------------------
 * Photographs, since 2026-09-21
 * ---------------------------------------------------------------------------
 * A message may carry up to four, chosen with the button on the left and
 * shown in a strip above the box until Send. Words are optional once there is
 * a photograph — the row's own check says words *or* a picture. What is
 * chosen is handed to `onSend` as files; the caller uploads them, because the
 * folder they go in is the caller's to know (the thread's, the room's), and
 * the composer stays ignorant of storage. The strip survives a failure the
 * same way the words do.
 *
 * ---------------------------------------------------------------------------
 * Editing is this box, not a second one — since 2026-09-29
 * ---------------------------------------------------------------------------
 * `edit` puts it in place of a post's or a message's words, holding them,
 * with Save and Cancel where Send was and Escape as Cancel. No photo picker:
 * an edit changes the words and not the photographs (HOME-PLAN.md, step 2b),
 * so the strip has nothing to offer. Save is unavailable while the words are
 * what they were, because the database refuses an edit that changes nothing
 * — "Edited" is never a lie — and a control that will be refused should not
 * look available. It is also unavailable on blank words unless the row has
 * photographs, which is the row's own check said before the round trip.
 *
 * ---------------------------------------------------------------------------
 * The reply bar
 * ---------------------------------------------------------------------------
 * `replyingTo` draws "Replying to Jan" over the box with a way to stop, and
 * moves focus into the box, since pressing Reply on a post halfway up the
 * screen is a decision to write. The bar is the caller's state; this only
 * draws it and reports the ✕.
 */
/** About six lines. Mirrored by `max-h-[150px]` on the textarea below. */
const MAX_HEIGHT = 150;

/**
 * Grow the box to fit what is in it, up to MAX_HEIGHT.
 *
 * Measured from the element rather than counted from the text: a wrapped line
 * and a typed one are the same height, and only the browser knows where the
 * wrap fell. See the note above about the border and about Windows — the two
 * lines that look redundant are the ones that matter.
 */
function fitToContent(element: HTMLTextAreaElement) {
  element.style.overflowY = 'hidden';
  element.style.height = 'auto';
  // offsetHeight - clientHeight is the two vertical borders, as the browser
  // actually used them. A vertical scrollbar takes width, not height, so it
  // cannot get into this number — and overflowY is hidden above, so a bar left
  // over from the last call cannot have narrowed the box and moved the wrap.
  const wanted = element.scrollHeight + (element.offsetHeight - element.clientHeight);
  element.style.height = `${Math.min(wanted, MAX_HEIGHT)}px`;
  element.style.overflowY = wanted > MAX_HEIGHT ? 'auto' : 'hidden';
}

export interface ComposerEdit {
  /** The words as they are now. */
  initial: string;
  /** Whether Save may send no words: true when the row has photographs. */
  allowEmpty: boolean;
  onCancel: () => void;
}

export interface ComposerReplyingTo {
  /** The post or message being answered; focus moves into the box when it changes. */
  id: string;
  /** Whose it is, for "Replying to Jan". */
  name: string;
  onCancel: () => void;
}

export function Composer({
  placeholder,
  sendLabel,
  onSend,
  sendOnEnter = false,
  maxLength = 4000,
  edit,
  replyingTo = null,
}: {
  placeholder: string;
  /** What the send button says to a screen reader. */
  sendLabel: string;
  /** Resolves to null on success, or to a sentence to show. */
  onSend: (body: string, files: File[]) => Promise<string | null>;
  sendOnEnter?: boolean;
  maxLength?: number;
  /** Editing in place: see the header. */
  edit?: ComposerEdit;
  /** A reply in progress, drawn over the box. */
  replyingTo?: ComposerReplyingTo | null;
}) {
  const [draft, setDraft] = useState(edit?.initial ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);
  // Whether this box was born as an editor. A ref, because the effect below
  // runs once, on mount, and `edit` is stable for the life of an editor.
  const bornEditing = useRef(edit !== undefined);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    fitToContent(element);
    if (bornEditing.current) {
      // Editing starts with the caret at the end of what is there, which is
      // where somebody fixing a sentence wants it.
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
    }
  }, []);

  // Pressing Reply is a decision to write, so the box takes focus.
  const replyingToId = replyingTo?.id ?? null;
  useEffect(() => {
    if (replyingToId) box.current?.focus();
  }, [replyingToId]);

  function resize() {
    const element = box.current;
    if (element) fitToContent(element);
  }

  const body = draft.trim();
  const unchanged = edit ? body === edit.initial.trim() : false;
  const allowEmpty = edit?.allowEmpty ?? false;
  const empty = body === '' && files.length === 0;
  const cannotSend = sending || unchanged || (empty && !allowEmpty);

  function send() {
    if (cannotSend) return;
    setSending(true);
    setFailure(null);
    void onSend(body, files)
      .then((problem) => {
        if (problem) {
          setFailure(problem);
          return;
        }
        setDraft('');
        setFiles([]);
        // The box shrinks back only once the words have actually gone.
        requestAnimationFrame(resize);
      })
      .finally(() => {
        setSending(false);
      });
  }

  const textarea = (
    <textarea
      ref={box}
      value={draft}
      rows={1}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(event) => {
        setDraft(event.target.value);
        resize();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && edit) {
          event.preventDefault();
          edit.onCancel();
          return;
        }
        if (event.key !== 'Enter') return;
        if (sendOnEnter && !event.shiftKey) {
          event.preventDefault();
          send();
        }
      }}
      className="max-h-[150px] min-h-[44px] flex-1 resize-none rounded-[22px] border-[1.6px] border-line bg-canvas px-[15px] py-[11px] text-[0.9375rem] text-ink leading-[1.45] outline-none focus:border-navy focus:bg-paper"
    />
  );

  const failureLine = failure ? (
    <p
      role="alert"
      className="mb-2 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2 text-[0.78125rem] text-destructive leading-[1.45]"
    >
      {failure} Your words are still here.
    </p>
  ) : null;

  if (edit) {
    return (
      <div className="mt-2">
        {failureLine}
        <div className="flex w-full items-end gap-[9px]">{textarea}</div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={send}
            disabled={cannotSend}
            className="min-h-[2.75rem] rounded-full bg-navy px-[1.1em] font-bold font-head text-[0.875rem] text-white transition-opacity disabled:opacity-35"
          >
            {sending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={edit.onCancel}
            disabled={sending}
            className="min-h-[2.75rem] rounded-full border border-line px-[1.1em] font-bold font-head text-[0.875rem] text-navy"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-none border-line border-t bg-paper px-3.5 py-2.5">
      {failureLine}
      {replyingTo ? (
        <div className="mx-auto mb-2 flex w-full max-w-[720px] items-center justify-between gap-2 rounded-[11px] bg-tint px-3 py-1.5">
          <span className="min-w-0 truncate text-[0.78125rem] text-ink2">
            Replying to <span className="font-semibold text-ink">{replyingTo.name}</span>
          </span>
          <button
            type="button"
            onClick={replyingTo.onCancel}
            aria-label="Stop replying"
            data-target="small"
            className="grid h-7 w-7 flex-none place-items-center rounded-full text-ink2 hover:bg-line"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <div className="mx-auto w-full max-w-[720px]">
        <PhotoStrip
          files={files}
          disabled={sending}
          onRemove={(index) => {
            setFiles((current) => current.filter((_, i) => i !== index));
          }}
        />
      </div>
      <div className="mx-auto flex w-full max-w-[720px] items-end gap-[9px]">
        <PhotoPicker files={files} onChange={setFiles} disabled={sending} compact />
        {textarea}
        <button
          type="button"
          onClick={send}
          disabled={cannotSend}
          aria-label={sendLabel}
          // 44px, and never data-target="small": this is the control the whole
          // screen exists for.
          className="grid h-11 w-11 flex-none place-items-center rounded-full bg-navy text-white transition-opacity disabled:opacity-35"
        >
          <SendHorizontal className="h-[19px] w-[19px]" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
