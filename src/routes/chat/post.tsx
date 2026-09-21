import { Link } from 'react-router-dom';
import { FormerMemberAvatar, MemberAvatar } from '@/components/member-avatar';
import { chatTime } from '@/lib/chat/time';
import type { ChatAuthor, ChatPost } from '@/lib/chat/types';

/**
 * One post in a topic, from the mock's `fpost()`.
 *
 * ---------------------------------------------------------------------------
 * A removed post keeps its place and its number
 * ---------------------------------------------------------------------------
 * The database blanks the body and keeps the row, so there is nothing here
 * deciding what to hide — the text is not in the answer. What is here is the
 * sentence that goes in its place, and there are two of them because they are
 * two different facts: somebody thinking better of what they wrote, and an
 * administrator taking it down. Rolling them into one ("This post was removed")
 * would hide a moderation decision behind an author's second thoughts.
 *
 * ---------------------------------------------------------------------------
 * Former member
 * ---------------------------------------------------------------------------
 * A null author is somebody who has left the club. Their words stay and their
 * name does not, which is the owner's decision. There is nothing to link to and
 * nothing to make initials from, so the tile is the neutral one.
 *
 * ---------------------------------------------------------------------------
 * One control in one slot: Remove, or Report, or nothing
 * ---------------------------------------------------------------------------
 * Report sits exactly where Remove sits, and never beside it. The reader can
 * take back what they wrote; on somebody else's post they can hand it to the
 * administrators. An administrator gets Remove on everything, which is the
 * stronger of the two — offering them Report as well would be offering them a
 * complaint addressed to themselves.
 *
 * It is a visible control and not a long-press or a swipe. Members here drive
 * with limited hand function, a mouth stick or a head pointer, and a gesture
 * that has to be held or dragged is a control some of them do not have.
 */
export function Post({
  post,
  author,
  number,
  total,
  canRemove,
  onRemove,
  removing,
  canReport,
  reported,
  onReport,
}: {
  post: ChatPost;
  /** Null for a removed member, and also while the name is still loading. */
  author: ChatAuthor | null;
  number: number;
  total: number;
  canRemove: boolean;
  onRemove: () => void;
  removing: boolean;
  /** Somebody else's post, which this reader cannot remove. */
  canReport: boolean;
  /** Already handed over. The control stays, and says so, and does nothing. */
  reported: boolean;
  onReport: () => void;
}) {
  const removed = post.removedAt !== null;

  return (
    <article className="mb-2.5 rounded-[15px] border border-line bg-paper px-3.5 py-[13px]">
      <div className="flex items-center gap-2.5">
        {/* Decorative: the name is the next thing in the row, and the link to
            the profile is on the name. An avatar that is its own link has no
            words in it to be the link's name — a screen reader reaches it and
            says "link, N". */}
        <span aria-hidden="true" className="flex-none">
          {author ? (
            <MemberAvatar
              id={author.id}
              displayName={author.displayName}
              photoPath={author.photoPath}
              photoAlt={author.photoAlt}
            />
          ) : (
            <FormerMemberAvatar />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block font-extrabold font-head text-[0.875rem] text-ink">
            {author ? (
              author.hasProfile ? (
                <Link to={`/peers/${author.id}`} className="underline-offset-2 hover:underline">
                  {author.displayName}
                </Link>
              ) : (
                // Named, not linked: /peers/:id will not show them, and a link
                // to a page that says "no such member" is worse than plain
                // text.
                author.displayName
              )
            ) : (
              'Former member'
            )}
            {author?.level ? (
              <span className="ml-[7px] font-semibold text-[0.78125rem] text-grey">
                {author.level}
              </span>
            ) : null}
          </span>
          <span className="block text-[0.78125rem] text-grey">{chatTime(post.createdAt)}</span>
        </span>

        {/* The mock's `.pnum`. It is why removal is soft: "3/11" has to mean
            the same thing before and after somebody takes a post back. */}
        <span className="flex-none font-bold text-[0.71875rem] text-grey">
          {number}/{total}
        </span>
      </div>

      {removed ? (
        <p className="mt-2 text-[0.875rem] text-grey italic leading-[1.5]">
          {post.removedByAdmin ? 'Removed by an administrator.' : 'Removed by its author.'}
        </p>
      ) : (
        // whitespace-pre-line, so the paragraph breaks somebody typed survive.
        <p className="mt-2 whitespace-pre-line text-[0.875rem] text-ink leading-[1.5]">
          {post.body}
        </p>
      )}

      {removed ? null : canRemove ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          data-target="small"
          className="mt-2 font-semibold text-[0.75rem] text-grey underline decoration-line underline-offset-2 hover:text-destructive"
        >
          {removing ? 'Removing…' : 'Remove'}
        </button>
      ) : canReport ? (
        reported ? (
          // Not a disabled button. A disabled control is read out as one and
          // invites a second try; this is a statement of what has happened.
          <p className="mt-2 font-semibold text-[0.75rem] text-grey">Reported</p>
        ) : (
          <button
            type="button"
            onClick={onReport}
            data-target="small"
            className="mt-2 font-semibold text-[0.75rem] text-grey underline decoration-line underline-offset-2 hover:text-destructive"
          >
            Report
          </button>
        )
      ) : null}
    </article>
  );
}
