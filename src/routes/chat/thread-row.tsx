import { Link } from 'react-router-dom';
import { FormerMemberAvatar, MemberAvatar } from '@/components/member-avatar';
import { threadTitle } from '@/lib/chat/threads';
import { chatTime } from '@/lib/chat/time';
import type { ChatAuthor, ChatThread } from '@/lib/chat/types';

/**
 * One conversation in the list, from the mock's `chatRow()`.
 *
 * ---------------------------------------------------------------------------
 * The whole row is the link, and the avatar is not
 * ---------------------------------------------------------------------------
 * A row whose link is the name leaves most of its own width dead, and the
 * thumb misses. So the row is one `Link` with the name inside it, and the tile
 * is `aria-hidden` — a screen reader reads the link once, by its words.
 *
 * ---------------------------------------------------------------------------
 * The last line is what was said, and who said it only where that is news
 * ---------------------------------------------------------------------------
 * "You: " in front of the reader's own, which is the one thing that tells a
 * glance whether the ball is in their court. Nothing in front of the other
 * member's in a direct conversation — the row is already titled with their
 * name, and "Nicole / Nicole: Three! Who did the fitting" spends a third of the
 * line saying it twice. In a group the name is news and is printed.
 *
 * It is truncated to one line: this is a list, and a row that grows with the
 * length of the last message makes the list a different shape every time
 * somebody speaks.
 *
 * A removed message reads "Message removed" rather than showing the blank the
 * database left, and a thread with nothing in it says so — not an empty line
 * that looks like a message that failed to load.
 */
export function ThreadRow({
  thread,
  other,
  lastAuthor,
  viewerId,
}: {
  thread: ChatThread;
  /** The other member of a direct conversation; null for a group. */
  other: ChatAuthor | null;
  /** Whoever wrote the last message; null for a former member or a group. */
  lastAuthor: ChatAuthor | null;
  viewerId: string | null;
}) {
  const title = threadTitle(thread, other?.displayName ?? null);
  const mine = thread.lastAuthorId !== null && thread.lastAuthorId === viewerId;

  // Who spoke, where that is not already the title of the row. See the header.
  const who = mine
    ? 'You: '
    : thread.kind === 'group'
      ? `${lastAuthor?.displayName ?? 'Former member'}: `
      : '';

  const last = thread.lastRemoved
    ? 'Message removed'
    : thread.lastBody === null
      ? 'Nothing said yet'
      : `${who}${thread.lastBody}`;

  return (
    <Link
      to={`/chat/t/${thread.id}`}
      className="flex min-h-[64px] w-full items-center gap-3 border-line border-b py-3 last:border-b-0"
    >
      <span aria-hidden="true" className="flex-none">
        {other ? (
          <MemberAvatar
            id={other.id}
            displayName={other.displayName}
            photoPath={other.photoPath}
            photoAlt={other.photoAlt}
          />
        ) : (
          <FormerMemberAvatar />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block font-extrabold font-head text-[0.90625rem] text-ink">
          {title}
          {thread.unread ? (
            <>
              {/* The dot is decorative and the word beside it is not: a screen
                  reader gets "new", which is the whole of what the dot means. */}
              <span
                aria-hidden="true"
                className="ml-[7px] inline-block h-[7px] w-[7px] rounded-full bg-navy align-middle"
              />
              <span className="sr-only"> — new</span>
            </>
          ) : null}
        </span>
        <span className="block text-[0.71875rem] text-grey">
          {thread.kind === 'group'
            ? `${thread.memberCount} ${thread.memberCount === 1 ? 'member' : 'members'}`
            : (other?.level ?? '')}
        </span>
        <span className="mt-[5px] block truncate text-[0.7875rem] text-ink2 leading-[1.4]">
          {last}
        </span>
      </span>

      <span className="flex-none self-start text-[0.71875rem] text-grey">
        {thread.lastAt ? chatTime(thread.lastAt) : ''}
      </span>
    </Link>
  );
}
