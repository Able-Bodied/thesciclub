import { MemberAvatar } from '@/components/member-avatar';
import type { ChatAuthor } from '@/lib/chat/types';

/** "Ana is typing", "Ana and Ben are typing", "Ana, Ben and 2 others are typing". */
export function typingSentence(names: readonly string[]): string {
  const [first, second] = names;
  if (first === undefined) return '';
  if (second === undefined) return `${first} is typing`;
  if (names.length === 2) return `${first} and ${second} are typing`;
  const others = names.length - 2;
  return `${first}, ${second} and ${String(others)} ${others === 1 ? 'other' : 'others'} are typing`;
}

/**
 * The three dots at the foot of a conversation while somebody else writes, in
 * a bubble like theirs, beside the first one's face (the owner, 2026-11-18).
 * A group names them over it, as it names who wrote each message.
 *
 * Drawn only: screen readers hear the sentence from the status line the thread
 * keeps outside its message log, so the dots are not read as a message.
 */
export function TypingDots({
  who,
  group,
}: {
  /** Whoever is typing, first to start first; empty draws nothing. */
  who: readonly (ChatAuthor | null)[];
  group: boolean;
}) {
  if (who.length === 0) return null;
  const first = who[0] ?? null;
  return (
    <div aria-hidden="true" className="mb-3.5 flex items-start gap-2.5">
      {first ? (
        <MemberAvatar
          id={first.id}
          displayName={first.displayName}
          photoPath={first.photoPath}
          photoAlt={first.photoAlt}
        />
      ) : (
        <span className="h-[34px] w-[34px] flex-none" />
      )}
      <div className="min-w-0">
        {group ? (
          <p className="mb-[3px] font-semibold text-[0.71875rem] text-grey">
            {typingSentence(who.map((author) => author?.displayName ?? 'Someone'))}
          </p>
        ) : null}
        <div className="inline-flex items-center gap-[5px] rounded-[4px_15px_15px_15px] border border-line bg-paper px-3.5 py-3.5">
          <span className="typing-dot" />
          <span className="typing-dot [animation-delay:160ms]" />
          <span className="typing-dot [animation-delay:320ms]" />
        </div>
      </div>
    </div>
  );
}
