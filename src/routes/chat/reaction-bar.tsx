import { SmilePlus } from 'lucide-react';
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
  what: string;
  state: ReactionsState;
  readerId: string | null;
  compact?: boolean;
  attached?: boolean;
  actions?: ReactNode;
}
export function ReactionBar({
  target,
  what,
  state,
  readerId,
  compact = false,
  attached = false,
  actions,
}: ReactionBarProps) {
  const [open, setOpen] = useState(false);
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
      className="relative inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-semibold text-emphasis hover:bg-tint disabled:opacity-50"
    >
      <SmilePlus aria-hidden="true" className="h-4 w-4" />
      {pending ? 'Saving…' : 'React'}
    </button>
  );
  async function choose(emoji: ReactionEmoji) {
    if (await state.choose(target, mine === emoji ? null : emoji)) setOpen(false);
  }
  return (
    <div className={`${attached ? 'relative -mt-2' : 'mt-2'} text-[0.8125rem] text-ink`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {!state.error &&
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
          })}
        {compact ? (
          <ItemActions what={what}>
            {trigger}
            {actions}
          </ItemActions>
        ) : (
          trigger
        )}
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
  choose: (emoji: ReactionEmoji) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useDialogFocus(dialog, heading, onClose);
  const authors = useChatAuthors(rows.map((r) => r.member_id));
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
        className="fixed inset-x-0 bottom-0 z-[81] max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-paper p-5 text-ink shadow-xl md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-[440px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl"
      >
        <h2 ref={heading} tabIndex={-1} className="font-bold font-head text-xl outline-none">
          React to {what}
        </h2>
        <p className="mt-2 text-sm text-grey">
          Choose a reaction. Choose yours again to remove it.
        </p>
        <div className="mt-4 grid grid-cols-4 gap-2">
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
        <button
          type="button"
          onClick={onClose}
          className="mt-5 min-h-12 w-full rounded-xl border border-line font-semibold"
        >
          Done
        </button>
      </div>
    </>
  );
}
