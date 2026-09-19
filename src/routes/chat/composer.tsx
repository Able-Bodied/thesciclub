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

  // Grow to fit, up to about six lines. Measured from the element rather than
  // counted from the text: a wrapped line and a typed one are the same height
  // and only the browser knows where the wrap fell.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 150)}px`;
  }, []);

  function resize() {
    const element = box.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 150)}px`;
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
