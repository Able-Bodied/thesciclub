import { SendHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * The box at the foot of a topic or a thread.
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

export function Composer({
  placeholder,
  sendLabel,
  onSend,
  sendOnEnter = false,
  maxLength = 4000,
}: {
  placeholder: string;
  /** What the send button says to a screen reader. */
  sendLabel: string;
  /** Resolves to null on success, or to a sentence to show. */
  onSend: (body: string) => Promise<string | null>;
  sendOnEnter?: boolean;
  maxLength?: number;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const element = box.current;
    if (element) fitToContent(element);
  }, []);

  function resize() {
    const element = box.current;
    if (element) fitToContent(element);
  }

  function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setFailure(null);
    void onSend(body)
      .then((problem) => {
        if (problem) {
          setFailure(problem);
          return;
        }
        setDraft('');
        // The box shrinks back only once the words have actually gone.
        requestAnimationFrame(resize);
      })
      .finally(() => {
        setSending(false);
      });
  }

  return (
    <div className="flex-none border-line border-t bg-paper px-3.5 py-2.5">
      {failure ? (
        <p className="mb-2 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2 text-[0.78125rem] text-destructive leading-[1.45]">
          {failure} Your words are still here.
        </p>
      ) : null}
      <div className="mx-auto flex w-full max-w-[720px] items-end gap-[9px]">
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
            if (event.key !== 'Enter') return;
            if (sendOnEnter && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          className="max-h-[150px] min-h-[44px] flex-1 resize-none rounded-[22px] border-[1.6px] border-line bg-canvas px-[15px] py-[11px] text-[0.9375rem] text-ink leading-[1.45] outline-none focus:border-navy focus:bg-paper"
        />
        <button
          type="button"
          onClick={send}
          disabled={!draft.trim() || sending}
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
