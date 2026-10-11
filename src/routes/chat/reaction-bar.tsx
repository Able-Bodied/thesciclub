import { SmilePlus, X } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChatAuthors } from '@/lib/chat/authors';
import {
  REACTIONS,
  type ReactionEmoji,
  type ReactionRow,
  type ReactionsState,
} from '@/lib/chat/reactions';
import { useDialogFocus } from '@/lib/dialog-focus';
import { ItemActions } from '@/routes/chat/item-actions';

/** Visible, generously sized controls: no long press or hover required.
 * Home's stretched topic links sit below these positioned buttons. */
export interface ReactionBarProps {
  target: string;
  /** The words being reacted to (or a description, e.g. "this photograph"). */
  what: string;
  /**
   * Whether `what` is the item's own words, quoted back in the picker. False
   * for a description such as "this photograph", which is not a quotation.
   */
  quoted?: boolean;
  state: ReactionsState;
  readerId: string | null;
  compact?: boolean;
  attached?: boolean;
  bubble?: ReactNode;
  align?: 'start' | 'end';
  actions?: ReactNode;
  reply?: ReactNode;
}
export function ReactionBar({
  target,
  what: words,
  quoted = true,
  state,
  readerId,
  compact = false,
  attached = false,
  bubble,
  align = 'start',
  actions,
  reply,
}: ReactionBarProps) {
  const [open, setOpen] = useState(false);
  // Short, so a long message is not printed again in the picker or read out
  // whole in every button's name (the owner, 2026-10-10).
  const what = quoted ? `“${excerpt(words)}”` : excerpt(words);
  const rows = state.rows.filter((r) => r.target_id === target && r.emoji !== null);
  const mine = rows.find((r) => r.member_id === readerId)?.emoji ?? null;
  const pending = state.pending.has(target);
  const disabled = !readerId || pending || state.loading;
  const trigger = (
    <button
      type="button"
      disabled={disabled}
      aria-label={`React to ${what}`}
      onClick={() => {
        setOpen(true);
      }}
      className="relative inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[0.6875rem] text-grey hover:bg-tint disabled:opacity-50"
    >
      <SmilePlus aria-hidden="true" className="h-3 w-3" />
      {pending ? 'Saving…' : 'React'}
    </button>
  );
  async function choose(emoji: ReactionEmoji) {
    const saved = await state.choose(target, mine === emoji ? null : emoji);
    if (saved) setOpen(false);
    return saved;
  }
  const counts =
    !state.error &&
    REACTIONS.map(({ emoji, name }) => {
      const count = rows.filter((r) => r.emoji === emoji).length;
      return count ? (
        <button
          key={emoji}
          type="button"
          aria-pressed={mine === emoji}
          aria-label={`${name}: ${count} ${count === 1 ? 'reaction' : 'reactions'} on ${what}${mine === emoji ? '. Remove your reaction' : '. React'}`}
          disabled={disabled}
          onClick={() => {
            void choose(emoji);
          }}
          className={`relative inline-flex min-h-11 min-w-11 ${attached ? 'items-start' : 'items-center'} justify-center rounded-full font-semibold disabled:opacity-50`}
        >
          <span
            className={`inline-flex items-center justify-center gap-1 rounded-full border ${attached ? 'min-h-7 px-2 text-[0.6875rem] shadow-sm' : 'min-h-11 px-3'} ${mine === emoji ? 'border-emphasis bg-tint text-emphasis' : 'border-line bg-paper'}`}
          >
            <span aria-hidden="true" className={attached ? 'text-sm' : 'text-lg'}>
              {emoji}
            </span>
            {count}
          </span>
        </button>
      ) : null;
    });
  const hasCounts = !state.error && rows.length > 0;
  return (
    <div
      className={`${bubble ? `flex min-w-0 max-w-full flex-col ${align === 'end' ? 'items-end' : 'items-start'}` : 'mt-2'} text-[0.8125rem] text-ink`}
    >
      {bubble ? (
        <div className="w-fit max-w-full">
          {bubble}
          {hasCounts ? (
            // Chip widths must not widen a short bubble; wrap within its width.
            <div className="relative -mt-2 flex w-0 min-w-full flex-wrap gap-1.5">{counts}</div>
          ) : null}
        </div>
      ) : null}
      <div className={`${bubble ? 'mt-1' : ''} flex flex-wrap items-center gap-1.5`}>
        {bubble ? null : counts}
        {trigger}
        {reply}
        {compact ? <ItemActions what={words}>{actions}</ItemActions> : null}
      </div>
      {state.error ? (
        <p className="relative text-grey">
          {state.error}{' '}
          <button
            type="button"
            onClick={state.reload}
            className="min-h-11 px-2 font-semibold underline"
          >
            Retry reactions
          </button>
        </p>
      ) : null}
      {state.failure?.target === target ? (
        <p role="alert" className="relative text-destructive">
          {state.failure.message}
        </p>
      ) : null}
      {open
        ? createPortal(
            <ReactionSheet
              rows={rows}
              mine={mine}
              what={what}
              pending={pending}
              failure={state.failure?.target === target ? state.failure.message : null}
              choose={choose}
              onClose={() => {
                setOpen(false);
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

function ReactionSheet({
  rows,
  mine,
  what,
  pending,
  failure,
  choose,
  onClose,
}: {
  rows: readonly ReactionRow[];
  mine: ReactionEmoji | null;
  what: string;
  pending: boolean;
  failure: string | null;
  choose: (emoji: ReactionEmoji) => Promise<boolean>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLParagraphElement>(null);
  useDialogFocus(dialog, heading, onClose);
  const authors = useChatAuthors(rows.map((r) => r.member_id));
  // The owner, 2026-10-10: a picker that is the emoji and little else. A
  // choice is saved and the picker closes as soon as it is tapped (it stays
  // open only when saving fails, to try again). No Done button; a small Close,
  // the backdrop and Escape remain, because somebody on a keyboard or a
  // switch needs a control to leave by, and the backdrop is not one.
  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close reactions"
        onClick={onClose}
        className="fixed inset-0 z-[80] bg-black/40"
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={`React to ${what}`}
        className="fixed inset-x-0 bottom-0 z-[81] max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-paper px-5 pt-4 pb-6 text-ink shadow-xl md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-[440px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl"
      >
        <div className="flex items-start gap-3">
          <p
            ref={heading}
            tabIndex={-1}
            className="min-w-0 flex-1 pt-2.5 text-[0.875rem] text-grey leading-snug outline-none [overflow-wrap:anywhere]"
          >
            {what}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-11 w-11 flex-none place-items-center rounded-full text-grey hover:bg-tint"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {REACTIONS.map(({ emoji, name }) => (
            <button
              key={emoji}
              type="button"
              aria-label={name}
              aria-pressed={mine === emoji}
              disabled={pending}
              onClick={() => {
                void choose(emoji);
              }}
              className={`min-h-12 rounded-xl border text-2xl disabled:opacity-50 ${mine === emoji ? 'border-emphasis bg-tint' : 'border-line hover:bg-tint'}`}
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          ))}
        </div>
        {mine ? (
          <p className="mt-2 text-[0.75rem] text-grey">Tap {mine} again to take it back.</p>
        ) : null}
        {failure ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {failure}
          </p>
        ) : null}
        {rows.length ? (
          <section className="mt-4 space-y-2" aria-label="Who reacted">
            {REACTIONS.map(({ emoji, name }) => {
              const people = rows.filter((r) => r.emoji === emoji);
              return people.length ? (
                <p key={emoji} className="text-sm">
                  <span aria-hidden="true">{emoji} </span>
                  <span className="font-semibold">
                    {name} ({people.length}):{' '}
                  </span>
                  {people.map((r) => authors.get(r.member_id)?.displayName ?? '…').join(', ')}
                </p>
              ) : null;
            })}
          </section>
        ) : null}
      </div>
    </>
  );
}

/** How much of what is being reacted to is quoted back. */
export const EXCERPT_LENGTH = 80;

/**
 * The first 80 characters, on one line, cut at a word with an ellipsis when
 * there is more. Counted in code points, so an emoji is not cut in half.
 */
export function excerpt(text: string, max = EXCERPT_LENGTH): string {
  const flat = Array.from(text.replace(/\s+/g, ' ').trim());
  if (flat.length <= max) return flat.join('');
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  const kept = space > max / 2 ? cut.slice(0, space) : cut;
  return `${kept.join('').trimEnd()}…`;
}
