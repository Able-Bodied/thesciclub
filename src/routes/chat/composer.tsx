import { SendHorizontal, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAnnounce } from '@/lib/announce';
import type { MentionScope } from '@/lib/mentions';
import { type PhotoTarget, pastePhotos } from '@/lib/paste-photos';
import { useMentionSuggestions } from '@/routes/chat/mention-suggestions';
import { PhotoPicker, PhotoStrip } from '@/routes/chat/photo-picker';

/**
 * The box at the foot of a topic or a thread, which also edits a post or a
 * message there.
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
 * Editing loads the words into this box — the owner, 2026-10-22
 * ---------------------------------------------------------------------------
 * `editing` puts a post's or a message's words here, under an "Editing" bar,
 * and Send saves them. The member's unsent draft is put aside and comes back
 * on Cancel, Escape or a save. Words only: the photographs stay as they are.
 * Unchanged words just close the edit, since the database refuses an edit
 * that changes nothing; blank words need photographs, as the row's own check.
 *
 * ---------------------------------------------------------------------------
 * The reply bar
 * ---------------------------------------------------------------------------
 * `replyingTo` draws "Replying to Jan" over the box with a way to stop, and
 * moves focus into the box, since pressing Reply on a post halfway up the
 * screen is a decision to write. The bar is the caller's state; this only
 * draws it and reports the ✕.
 *
 * `mentions` suggests members after an "@" (20261029070000), once a letter
 * follows it. `mentionScope` says where to look (the owner, 2026-10-29): a
 * conversation keeps to its members; a topic puts its own people first.
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

export interface ComposerEditing {
  /** The post or message being edited; a new id loads its words. */
  id: string;
  /** Its words as they are now. */
  initial: string;
  noun: 'message' | 'post';
  /** How many photographs it has. An edit keeps them. */
  photos: number;
  /** A post may have photographs added while it is edited (20261029000000). */
  addPhotos?: boolean;
  /** It shares a post, which an edit keeps, so its words may go. */
  shared?: boolean;
  /** The item's element id: its ••• takes focus afterwards. */
  anchor: string;
  /** Resolves to null once saved, or to the sentence to show; files are the photographs added. */
  onSave: (body: string, files: File[]) => Promise<string | null>;
  /** The edit is over: saved, cancelled, or nothing changed. */
  onClose: () => void;
}

export interface ComposerReplyingTo {
  /** The post or message being answered; focus moves into the box when it changes. */
  id: string;
  /** Whose it is, for "Replying to Jan". */
  name: string;
  onCancel: () => void;
}

/** Back to the edited item's •••, or the box when it has none. */
function focusAfterEdit(anchor: string, fallback: HTMLElement | null) {
  const actions = document
    .getElementById(anchor)
    ?.querySelector<HTMLElement>('[data-item-actions]');
  (actions ?? fallback)?.focus();
}

function excerpt(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > 90 ? `${line.slice(0, 90)}…` : line;
}

export function Composer({
  placeholder,
  sendLabel,
  onSend,
  sendOnEnter = false,
  maxLength = 4000,
  replyingTo = null,
  editing = null,
  mentions = false,
  mentionScope = {},
}: {
  placeholder: string;
  /** What the send button says to a screen reader. */
  sendLabel: string;
  /** Resolves to null on success, or to a sentence to show. */
  onSend: (body: string, files: File[]) => Promise<string | null>;
  sendOnEnter?: boolean;
  maxLength?: number;
  /** A reply in progress, drawn over the box. */
  replyingTo?: ComposerReplyingTo | null;
  /** A post or message whose words are in the box: see the header. */
  editing?: ComposerEditing | null;
  /** Suggest members after an "@": see the header. */
  mentions?: boolean;
  mentionScope?: MentionScope;
}) {
  const announce = useAnnounce();
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  // Added to the post being edited: apart from the draft's, which wait for it.
  const [editFiles, setEditFiles] = useState<File[]>([]);
  // Pictures pasted into the box join the photographs (lib/paste-photos.ts).
  // Null while editing, which keeps the photographs it had.
  const photos = useRef<PhotoTarget | null>(null);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);
  const draftVersion = useRef(0);
  /** The member's own draft, put aside while they edit. */
  const setAside = useRef<{ text: string; version: number } | null>(null);
  /** Whose words are in the box: the edited item's id, or null for the draft. */
  const loaded = useRef<string | null>(null);
  /** Bumped when the words are swapped, to fit the box and place the caret. */
  const [swaps, setSwaps] = useState(0);

  useEffect(() => {
    const element = box.current;
    if (element) fitToContent(element);
  }, []);

  const editingId = editing?.id ?? null;
  const editingWords = editing?.initial ?? '';
  const editingNoun = editing?.noun ?? 'message';
  useLayoutEffect(() => {
    if (editingId === loaded.current) return;
    const from = loaded.current;
    loaded.current = editingId;
    setFailure(null);
    if (editingId !== null) {
      if (from === null) setAside.current = { text: draft, version: draftVersion.current };
      draftVersion.current += 1;
      setDraft(editingWords);
      announce(`Editing your ${editingNoun}.`);
    } else {
      // The draft's own version too, so a send still in flight clears it.
      const back = setAside.current;
      setAside.current = null;
      draftVersion.current = back ? back.version : draftVersion.current + 1;
      setDraft(back ? back.text : '');
    }
    setSwaps((n) => n + 1);
  }, [editingId, editingWords, editingNoun, draft, announce]);

  useLayoutEffect(() => {
    const element = box.current;
    if (swaps === 0 || !element) return;
    fitToContent(element);
    // Editing starts with the caret at the end, where somebody fixing a
    // sentence wants it.
    if (loaded.current !== null) {
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
    }
  }, [swaps]);

  // Pressing Reply is a decision to write, so the box takes focus.
  const replyingToId = replyingTo?.id ?? null;
  useEffect(() => {
    if (replyingToId) box.current?.focus();
  }, [replyingToId]);

  function resize() {
    const element = box.current;
    if (element) fitToContent(element);
  }

  const mention = useMentionSuggestions({
    box,
    value: draft,
    onChange: (next) => {
      draftVersion.current += 1;
      setDraft(next);
      requestAnimationFrame(resize);
    },
    above: true,
    enabled: mentions,
    among: mentionScope.among,
    first: mentionScope.first,
  });

  const body = draft.trim();
  const empty = body === '' && files.length === 0;
  // Blank words with no photographs: Remove is the way to take it back.
  const blank =
    editing !== null &&
    body === '' &&
    editing.photos === 0 &&
    editFiles.length === 0 &&
    !editing.shared;
  const cannotSend = sending || (editing ? blank : empty);

  function finishEdit(current: ComposerEditing, message: string) {
    setEditFiles([]);
    current.onClose();
    announce(message);
    requestAnimationFrame(() => {
      // Not once the screen has gone.
      if (box.current) focusAfterEdit(current.anchor, box.current);
    });
  }

  function saveEdit(current: ComposerEditing) {
    if (body === current.initial.trim() && editFiles.length === 0) {
      finishEdit(current, 'Nothing changed. Edit cancelled.');
      return;
    }
    setSending(true);
    setFailure(null);
    void current
      .onSave(body, editFiles)
      .then((problem) => {
        if (problem) {
          setFailure(problem);
          return;
        }
        finishEdit(current, 'Changes saved.');
      })
      .finally(() => {
        setSending(false);
      });
  }

  function send() {
    if (cannotSend) return;
    if (editing) {
      saveEdit(editing);
      return;
    }
    const submittedVersion = draftVersion.current;
    setSending(true);
    setFailure(null);
    void onSend(body, files)
      .then((problem) => {
        if (problem) {
          setFailure(problem);
          return;
        }
        // A member may already be writing the next message while this one
        // saves, or editing another with this draft put aside.
        if (draftVersion.current === submittedVersion) setDraft('');
        else if (setAside.current?.version === submittedVersion) setAside.current.text = '';
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
      placeholder={editing ? `Edit your ${editing.noun}` : placeholder}
      aria-label={editing ? `Edit your ${editing.noun}` : placeholder}
      readOnly={editing !== null && sending}
      {...(mentions ? mention.boxProps : {})}
      onPaste={(event) => {
        pastePhotos(event, photos.current);
      }}
      onChange={(event) => {
        draftVersion.current += 1;
        setDraft(event.target.value);
        resize();
      }}
      onKeyDown={(event) => {
        if (mention.onKeyDown(event)) return;
        if (event.key === 'Escape' && editing) {
          event.preventDefault();
          if (!sending) finishEdit(editing, 'Edit cancelled.');
          return;
        }
        // Safari can report composition Enter only through legacy keyCode.
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
        if (event.key !== 'Enter') return;
        if (sendOnEnter && !event.shiftKey) {
          event.preventDefault();
          send();
        }
      }}
      className="max-h-[150px] min-h-[44px] flex-1 resize-none rounded-[22px] border-[1.6px] border-line bg-canvas px-[15px] py-[11px] text-[0.9375rem] text-ink leading-[1.45] outline-none focus:border-emphasis focus:bg-paper"
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

  const editBar = editing ? (
    <div className="mx-auto mb-2 flex w-full max-w-[720px] items-center gap-2 rounded-[11px] border-emphasis border-l-[3px] bg-tint py-1 pr-1 pl-3">
      <div className="min-w-0 flex-1 py-1 text-[0.8125rem] text-ink2 leading-[1.4]">
        <p className="font-semibold text-ink">Editing {editing.noun}</p>
        {editing.initial.trim() ? <p className="truncate">{excerpt(editing.initial)}</p> : null}
        {editing.photos > 0 ? (
          <p>
            {editing.photos === 1
              ? 'Its photograph stays as it is.'
              : `Its ${editing.photos} photographs stay as they are.`}
            {editing.addPhotos && editing.photos < 4 ? ' You can add more.' : ''}
          </p>
        ) : null}
        {editing.shared ? <p>The shared post stays.</p> : null}
        <p aria-live="polite">
          {blank ? `A ${editing.noun} needs words. To delete it, use Remove.` : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          finishEdit(editing, 'Edit cancelled.');
        }}
        disabled={sending}
        aria-label="Cancel editing"
        className="inline-flex min-h-11 flex-none items-center gap-1 rounded-full px-3 font-semibold text-[0.8125rem] text-emphasis hover:bg-line disabled:opacity-50"
      >
        <X className="h-4 w-4" aria-hidden="true" />
        Cancel
      </button>
    </div>
  ) : null;

  return (
    <div className="flex-none border-line border-t bg-paper px-3.5 py-2.5">
      {failureLine}
      {editBar}
      {replyingTo && !editing ? (
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
      {mentions ? (
        <div className="relative mx-auto w-full max-w-[720px]">{mention.list}</div>
      ) : null}
      {editing && !editing.addPhotos ? null : (
        <div className="mx-auto w-full max-w-[720px]">
          <PhotoStrip
            files={editing ? editFiles : files}
            disabled={sending}
            onRemove={(index) => {
              (editing ? setEditFiles : setFiles)((current) =>
                current.filter((_, i) => i !== index),
              );
            }}
          />
        </div>
      )}
      <div className="mx-auto flex w-full max-w-[720px] items-end gap-[9px]">
        {editing ? (
          editing.addPhotos ? (
            <PhotoPicker
              files={editFiles}
              onChange={setEditFiles}
              disabled={sending}
              already={editing.photos}
              compact
            />
          ) : null
        ) : (
          <PhotoPicker ref={photos} files={files} onChange={setFiles} disabled={sending} compact />
        )}
        {textarea}
        <button
          type="button"
          onClick={send}
          disabled={cannotSend}
          aria-label={editing ? 'Save changes' : sendLabel}
          // 44px, and never data-target="small": this is the control the whole
          // screen exists for.
          className="grid h-11 w-11 flex-none place-items-center rounded-full bg-action text-white transition-opacity disabled:opacity-35"
        >
          <SendHorizontal className="h-[19px] w-[19px]" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
