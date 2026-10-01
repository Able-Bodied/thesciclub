import { Link } from 'react-router-dom';
import { LinkedText } from '@/components/linked-text';
import { FormerMemberAvatar, MemberAvatar } from '@/components/member-avatar';
import { chatTime } from '@/lib/chat/time';
import type { ChatAuthor, ChatMessage } from '@/lib/chat/types';
import { AttachmentGrid } from '@/routes/chat/attachment-grid';
import { Composer } from '@/routes/chat/composer';
import { ReportControl } from '@/routes/chat/report-control';

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
 * A reply is a quote, not a nest — since 2026-09-29
 * ---------------------------------------------------------------------------
 * A message that answers another carries a short quote of it at the top of
 * the bubble (HOME-PLAN.md, decision 11). Tapping the quote scrolls the
 * quoted message into view and lights it up once. The list stays in time
 * order: a nest in a chat would break the one thing a conversation is. The
 * quote's words are `quoteText`'s — "Removed message", "Photograph" — and
 * the thread page finds them, since it holds the list.
 *
 * ---------------------------------------------------------------------------
 * Edit and Reply, then Remove on yours or Report on theirs
 * ---------------------------------------------------------------------------
 * Edit is the author's own, in place: the bubble is swapped for the composer
 * holding the words, with Save and Cancel. Reply is on every standing
 * bubble. Then Remove or Report, never both and never neither: your own
 * bubble carries Remove; somebody else's carries Report, which hands that
 * one message and nothing else in the conversation to the administrators. An
 * administrator in a conversation is a member of it and gets the same — the
 * thread screen has never offered them anybody else's Remove, because a
 * private thread they could moderate from the inside would not be private.
 *
 * Each control is named for its message — "Reply to Jan's message" — so a
 * conversation is not a column of identical buttons to a screen reader.
 * Visible controls, not a long-press and not a swipe. Members here drive with
 * limited hand function, a mouth stick or a head pointer.
 */
export interface Quote {
  /** The quoted message's id, for the scroll. */
  id: string;
  /** Whose it was. */
  name: string;
  /** `quoteText`'s words. */
  text: string;
}

export function MessageBubble({
  message,
  author,
  mine,
  quote,
  onQuoteTap,
  flash,
  canEdit,
  editing,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  canReply,
  onReply,
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
  /** The message this one answers, or null. */
  quote: Quote | null;
  onQuoteTap: (messageId: string) => void;
  /** Light the bubble up once: a quote of it was just tapped. */
  flash: boolean;
  /** The reader's own standing message. */
  canEdit: boolean;
  /** The composer is in place of the bubble. */
  editing: boolean;
  onEdit: () => void;
  /** Resolves to null once saved, or to the sentence to show. */
  onSaveEdit: (body: string) => Promise<string | null>;
  onCancelEdit: () => void;
  /** Any standing message, while there is somebody to reply to. */
  canReply: boolean;
  onReply: () => void;
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
  const name = author ? author.displayName : 'a former member';
  const whose = mine ? 'your' : `${name}'s`;
  const edited = message.editedAt ? ` · Edited ${chatTime(message.editedAt)}` : '';
  const control =
    'font-semibold text-[0.71875rem] text-grey underline decoration-line underline-offset-2';
  const anchor = `message-${message.id}`;

  const quoteBlock = quote ? (
    <button
      type="button"
      onClick={() => {
        onQuoteTap(quote.id);
      }}
      data-target="small"
      className={
        'mb-1.5 block w-full rounded-[9px] border-l-2 px-2 py-1 text-left text-[0.78125rem] leading-[1.4] ' +
        (mine ? 'border-white/50 bg-white/10 text-white/85' : 'border-navy bg-tint text-ink2')
      }
    >
      <span className="block font-semibold">{quote.name}</span>
      <span className="block truncate">{quote.text}</span>
    </button>
  ) : null;

  const words = removed ? (
    <span className={mine ? 'text-white/70 italic' : 'text-grey italic'}>{gone}</span>
  ) : (
    <>
      {/* whitespace-pre-line, so the line breaks somebody typed survive. */}
      {message.body ? (
        <span className="whitespace-pre-line">
          <LinkedText text={message.body} />
        </span>
      ) : null}
      {message.attachments.length > 0 ? (
        <AttachmentGrid paths={message.attachments} from={mine ? 'you' : name} />
      ) : null}
    </>
  );

  const controls =
    removed || message.pending || editing ? null : (
      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
        {canEdit ? (
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit your message"
            data-target="small"
            className={`${control} hover:text-navy`}
          >
            Edit
          </button>
        ) : null}
        {canReply ? (
          <button
            type="button"
            onClick={onReply}
            aria-label={`Reply to ${whose} message`}
            data-target="small"
            className={`${control} hover:text-navy`}
          >
            Reply
          </button>
        ) : null}
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={removing}
            aria-label={`Remove ${whose} message`}
            data-target="small"
            className={`${control} hover:text-destructive`}
          >
            {removing ? 'Removing…' : 'Remove'}
          </button>
        ) : canReport ? (
          <ReportControl
            reported={reported}
            label={`Report ${name}'s message`}
            onReport={onReport}
            buttonClassName={`${control} hover:text-destructive`}
            noteClassName="font-semibold text-[0.71875rem] text-grey"
          />
        ) : null}
      </div>
    );

  if (mine) {
    return (
      <div id={anchor} className="mb-3.5 flex flex-col items-end">
        {editing ? (
          <div className="w-full">
            <Composer
              placeholder="Your message"
              sendLabel="Save your message"
              sendOnEnter={false}
              onSend={(body) => onSaveEdit(body)}
              edit={{
                initial: message.body,
                allowEmpty: message.attachments.length > 0,
                onCancel: onCancelEdit,
              }}
            />
          </div>
        ) : (
          <div
            className={
              'max-w-[17rem] rounded-[15px_15px_4px_15px] bg-navy px-3.5 py-2.5 text-[0.875rem] text-white leading-[1.5]' +
              (message.pending ? ' opacity-60' : '') +
              (flash ? ' message-flash' : '')
            }
          >
            {quoteBlock}
            {words}
          </div>
        )}
        <p className="mt-1 font-semibold text-[0.71875rem] text-grey">
          {message.pending ? 'Sending…' : `You · ${chatTime(message.createdAt)}${edited}`}
        </p>
        {controls}
      </div>
    );
  }

  return (
    <div id={anchor} className="mb-3.5 flex items-start gap-2.5">
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
          {edited}
        </p>
        <div
          className={
            'max-w-[17rem] rounded-[4px_15px_15px_15px] border border-line bg-paper px-3.5 py-2.5 text-[0.875rem] text-ink leading-[1.5]' +
            (flash ? ' message-flash' : '')
          }
        >
          {quoteBlock}
          {words}
        </div>
        {controls}
      </div>
    </div>
  );
}
