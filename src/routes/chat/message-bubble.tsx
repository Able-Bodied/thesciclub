import { Link } from 'react-router-dom';
import { FormerMemberAvatar, MemberAvatar } from '@/components/member-avatar';
import { chatTime } from '@/lib/chat/time';
import type { ChatAuthor, ChatMessage } from '@/lib/chat/types';
import { AttachmentGrid } from '@/routes/chat/attachment-grid';

/**
 * One message, from the mock's `msgBubble()`.
 *
 * ---------------------------------------------------------------------------
 * Two shapes, and the reader's own is the one on the right
 * ---------------------------------------------------------------------------
 * Somebody else's message carries a face, a name and a level, and sits left
 * against paper. The reader's own is navy, on the right, and carries no avatar
 * and no name — they know who they are, and a column of your own face beside
 * your own words is the thing every chat app learned not to draw.
 *
 * The level goes beside somebody else's name for the reason it goes everywhere
 * else in this club: it is the first thing a member reads another member by.
 *
 * ---------------------------------------------------------------------------
 * Pending
 * ---------------------------------------------------------------------------
 * A bubble the reader has sent and the database has not confirmed is drawn at
 * once and faded, with "Sending…" where its time would be. If the write is
 * refused the bubble is taken back out and the composer is handed the words
 * back — see threads.ts. What must never happen is a bubble that looks sent and
 * was not, which is why this says "Sending…" rather than a clock it has made up.
 *
 * ---------------------------------------------------------------------------
 * Removed, and former members
 * ---------------------------------------------------------------------------
 * The database blanks the body, so there is nothing here deciding what to hide.
 * What is here is the sentence that goes in its place, and there are two of
 * them because they are two different facts: somebody thinking better of what
 * they said, and an administrator taking it down.
 *
 * A null author is somebody who has left the club. Their words stay and their
 * name does not.
 *
 * ---------------------------------------------------------------------------
 * Remove on your own, Report on theirs
 * ---------------------------------------------------------------------------
 * Never both, and never neither. Your own bubble carries Remove; somebody
 * else's carries Report, which hands that one message and nothing else in the
 * conversation to the administrators. An administrator in a conversation is a
 * member of it and gets the same two — the thread screen has never offered
 * them anybody else's Remove, because a private thread they could moderate
 * from the inside would not be private.
 *
 * A visible control, not a long-press and not a swipe. Members here drive with
 * limited hand function, a mouth stick or a head pointer.
 */
export function MessageBubble({
  message,
  author,
  mine,
  canRemove,
  onRemove,
  removing,
  canReport,
  reported,
  onReport,
}: {
  message: ChatMessage;
  /** Null for a removed member, and also while the name is still loading. */
  author: ChatAuthor | null;
  mine: boolean;
  canRemove: boolean;
  onRemove: () => void;
  removing: boolean;
  /** Somebody else's message. Never true on the reader's own. */
  canReport: boolean;
  /** Already handed over. The control stays, and says so, and does nothing. */
  reported: boolean;
  onReport: () => void;
}) {
  const removed = message.removedAt !== null;
  // Two sentences and not one: somebody thinking better of what they said and
  // an administrator taking it down are different facts, and rolling them
  // together would hide a moderation decision behind second thoughts.
  const gone = message.removedByAdmin ? 'Removed by an administrator.' : 'Removed by its author.';

  if (mine) {
    return (
      <div className="mb-3.5 flex flex-col items-end">
        <div
          className={
            'max-w-[17rem] rounded-[15px_15px_4px_15px] bg-navy px-3.5 py-2.5 text-[0.875rem] text-white leading-[1.5]' +
            (message.pending ? ' opacity-60' : '')
          }
        >
          {removed ? (
            <span className="text-white/70 italic">{gone}</span>
          ) : (
            <>
              {/* whitespace-pre-line, so the line breaks somebody typed survive. */}
              {message.body ? <span className="whitespace-pre-line">{message.body}</span> : null}
              {message.attachments.length > 0 ? (
                <AttachmentGrid paths={message.attachments} from="you" />
              ) : null}
            </>
          )}
        </div>
        <p className="mt-1 font-semibold text-[0.71875rem] text-grey">
          {message.pending ? 'Sending…' : `You · ${chatTime(message.createdAt)}`}
        </p>
        {canRemove && !removed && !message.pending ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={removing}
            data-target="small"
            className="mt-0.5 font-semibold text-[0.71875rem] text-grey underline decoration-line underline-offset-2 hover:text-destructive"
          >
            {removing ? 'Removing…' : 'Remove'}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mb-3.5 flex items-start gap-2.5">
      {/* Decorative: the name is printed on the next line and the link to the
          profile is on the name. An avatar that is its own link has no words in
          it to be the link's name. */}
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
      <div className="min-w-0">
        <p className="mb-[3px] font-semibold text-[0.71875rem] text-grey">
          {author ? (
            author.hasProfile ? (
              <Link to={`/peers/${author.id}`} className="underline-offset-2 hover:underline">
                {author.displayName}
              </Link>
            ) : (
              // Named, not linked: /peers/:id will not show them, and a link to
              // a page that says "no such member" is worse than plain text.
              author.displayName
            )
          ) : (
            'Former member'
          )}
          {author?.level ? ` · ${author.level}` : ''} · {chatTime(message.createdAt)}
        </p>
        <div className="max-w-[17rem] rounded-[4px_15px_15px_15px] border border-line bg-paper px-3.5 py-2.5 text-[0.875rem] text-ink leading-[1.5]">
          {removed ? (
            <span className="text-grey italic">{gone}</span>
          ) : (
            <>
              {message.body ? <span className="whitespace-pre-line">{message.body}</span> : null}
              {message.attachments.length > 0 ? (
                <AttachmentGrid
                  paths={message.attachments}
                  from={author?.displayName ?? 'a former member'}
                />
              ) : null}
            </>
          )}
        </div>
        {removed ? null : canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={removing}
            data-target="small"
            className="mt-0.5 font-semibold text-[0.71875rem] text-grey underline decoration-line underline-offset-2 hover:text-destructive"
          >
            {removing ? 'Removing…' : 'Remove'}
          </button>
        ) : canReport ? (
          reported ? (
            // Not a disabled button. A disabled control is read out as one and
            // invites a second try; this is a statement of what has happened.
            <p className="mt-0.5 font-semibold text-[0.71875rem] text-grey">Reported</p>
          ) : (
            <button
              type="button"
              onClick={onReport}
              data-target="small"
              className="mt-0.5 font-semibold text-[0.71875rem] text-grey underline decoration-line underline-offset-2 hover:text-destructive"
            >
              Report
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
