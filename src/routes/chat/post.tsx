import { type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { LinkedText } from '@/components/linked-text';
import { FormerMemberAvatar, MemberAvatar } from '@/components/member-avatar';
import { chatTime } from '@/lib/chat/time';
import type { ChatAuthor, ChatEdit, ChatPost } from '@/lib/chat/types';
import { AttachmentGrid } from '@/routes/chat/attachment-grid';
import { Composer } from '@/routes/chat/composer';
import { EarlierVersions } from '@/routes/chat/earlier-versions';
import { PostLikes } from '@/routes/chat/like-button';

/**
 * One post in a topic, from the mock's `fpost()`.
 *
 * ---------------------------------------------------------------------------
 * A removed post is not drawn at all
 * ---------------------------------------------------------------------------
 * The owner, 2026-09-27: "Removed by its author." in a topic did not look good.
 * The topic page leaves removed posts out before they get here, so this only
 * ever draws a post that is standing. Underneath, removal is still soft — the
 * row stays for reports and moderation (20260927030000).
 *
 * ---------------------------------------------------------------------------
 * Former member
 * ---------------------------------------------------------------------------
 * A null author is somebody who has left the club. Their words stay and their
 * name does not, which is the owner's decision. There is nothing to link to and
 * nothing to make initials from, so the tile is the neutral one.
 *
 * ---------------------------------------------------------------------------
 * The controls in one row, each named for its post
 * ---------------------------------------------------------------------------
 * Like and its count first (HOME-PLAN.md step 3; like-button.tsx says why
 * there is no Like on your own post), then Edit and Reply since 2026-09-29
 * (decisions 9 and 11), then Remove, or Report, or nothing. Report sits exactly where Remove sits, and
 * never beside it: the reader can take back what they wrote; on somebody
 * else's post they can hand it to the administrators. An administrator gets
 * Remove on everything, which is the stronger of the two — offering them
 * Report as well would be offering them a complaint addressed to themselves.
 * Edit is the author's alone, an administrator included: an administrator
 * removes, and does not rewrite somebody's words in their name.
 *
 * Each control carries the post in its name — "Reply to Jan's post", "Remove
 * your post" — because a topic of twenty posts is otherwise a column of
 * twenty identical "Reply" buttons in a screen reader's list.
 *
 * They are visible controls and not a long-press or a swipe. Members here
 * drive with limited hand function, a mouth stick or a head pointer, and a
 * gesture that has to be held or dragged is a control some of them do not
 * have.
 *
 * ---------------------------------------------------------------------------
 * Editing is the composer, in place
 * ---------------------------------------------------------------------------
 * Pressing Edit swaps the words for the composer holding them, with Save and
 * Cancel. The photographs stay drawn and stay as they are: an edit changes
 * the words only. "Edited · 9:30am" sits under the body afterwards, in the
 * byline's colour, for everybody; an administrator also gets the earlier
 * versions, under a disclosure, from chat_edits.
 *
 * ---------------------------------------------------------------------------
 * Replies sit under the post they answer
 * ---------------------------------------------------------------------------
 * The topic page hands a top-level post its replies as `children`, drawn
 * inside the article, indented and unnumbered. A reply's own Reply files
 * under the same post — one level is the rule, and the trigger enforces it.
 *
 * **They can be hidden** — the owner, 2026-09-29, for the day a thread of
 * replies gets long. "Hide 3 replies" over the replies folds them away and
 * becomes "Show 3 replies"; the control names its post to a screen reader
 * and says `aria-expanded`. Shown by default on every visit: the words are
 * what a topic is for, and hiding is a reader's answer to one long thread
 * rather than a setting. The replies come back on their own when their
 * number changes — a reply you have just written under a folded post must
 * not land where you cannot see it — which is why what is stored is the
 * count at which they were hidden, not a flag. No control on a post with no
 * replies: a count of zero is not drawn.
 */
export function Post({
  post,
  author,
  number,
  total,
  nested = false,
  canEdit,
  editing,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  canReply = false,
  onReply,
  canRemove,
  onRemove,
  removing,
  canReport,
  reported,
  onReport,
  edits,
  likes,
  replies = 0,
  children,
}: {
  post: ChatPost;
  /** Null for a removed member, and also while the name is still loading. */
  author: ChatAuthor | null;
  /** Its place among the top-level posts still standing. Absent on a reply. */
  number?: number;
  total?: number;
  /** A reply, drawn under its post: no number, no border of its own. */
  nested?: boolean;
  /** The reader's own standing post. */
  canEdit: boolean;
  /** The composer is in place of the words. */
  editing: boolean;
  onEdit: () => void;
  /** Resolves to null once saved, or to the sentence to show. */
  onSaveEdit: (body: string) => Promise<string | null>;
  onCancelEdit: () => void;
  /** Whether the reader may write in this room at all. */
  canReply?: boolean;
  onReply?: () => void;
  canRemove: boolean;
  onRemove: () => void;
  removing: boolean;
  /** Somebody else's post, which this reader cannot remove. */
  canReport: boolean;
  /** Already handed over. The control stays, and says so, and does nothing. */
  reported: boolean;
  onReport: () => void;
  /** Earlier versions, for an administrator. Absent or empty for everybody else. */
  edits?: ChatEdit[];
  /**
   * Who likes it, and what pressing Like does. Absent draws no likes at all —
   * while they have not loaded, or where a screen does not read them.
   */
  likes?:
    | {
        likedBy: readonly string[];
        /** The reader, or null on their own post, which draws no Like button. */
        readerId: string | null;
        onToggle: () => void;
        /** The sentence for a like that did not land on this post, or null. */
        failure: string | null;
      }
    | undefined;
  /** How many replies `children` holds, for the hide control. */
  replies?: number;
  /** The replies, as `<Post nested>` elements. */
  children?: ReactNode;
}) {
  // The count the replies were hidden at, or null. See the header.
  const [hiddenAt, setHiddenAt] = useState<number | null>(null);
  const hidden = replies > 0 && hiddenAt === replies;
  const repliesId = `replies-${post.id}`;
  const name = author ? author.displayName : 'a former member';
  const whose = canEdit ? 'your' : `${name}'s`;
  const control =
    'font-semibold text-[0.75rem] text-grey underline decoration-line underline-offset-2';

  return (
    <article
      className={
        nested
          ? 'mt-2.5 border-line border-l-2 pl-3'
          : 'mb-2.5 rounded-[15px] border border-line bg-paper px-3.5 py-[13px]'
      }
    >
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

        {/* The mock's `.pnum`, counted among the top-level posts still
            standing. A reply has no number. */}
        {number !== undefined && total !== undefined ? (
          <span className="flex-none font-bold text-[0.71875rem] text-grey">
            {number}/{total}
          </span>
        ) : null}
      </div>

      {editing ? (
        <Composer
          placeholder="Your post"
          sendLabel="Save your post"
          sendOnEnter={false}
          onSend={(body) => onSaveEdit(body)}
          edit={{
            initial: post.body,
            allowEmpty: post.attachments.length > 0,
            onCancel: onCancelEdit,
          }}
        />
      ) : post.body ? (
        // whitespace-pre-line, so the paragraph breaks somebody typed survive.
        <p className="mt-2 whitespace-pre-line text-[0.875rem] text-ink leading-[1.5]">
          <LinkedText text={post.body} />
        </p>
      ) : null}
      {post.attachments.length > 0 ? (
        <AttachmentGrid paths={post.attachments} from={author?.displayName ?? 'a former member'} />
      ) : null}
      {post.editedAt && !editing ? (
        <p className="mt-1 text-[0.78125rem] text-grey">Edited · {chatTime(post.editedAt)}</p>
      ) : null}
      {edits && edits.length > 0 && !editing ? <EarlierVersions edits={edits} from={name} /> : null}

      {editing ? null : (
        <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1">
          {likes ? (
            <PostLikes
              likedBy={likes.likedBy}
              readerId={likes.readerId}
              what={`${whose} post`}
              onToggle={likes.onToggle}
              className="text-[0.75rem]"
            />
          ) : null}
          {canEdit ? (
            <button
              type="button"
              onClick={onEdit}
              aria-label="Edit your post"
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
              aria-label={`Reply to ${whose} post`}
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
              aria-label={`Remove ${whose} post`}
              data-target="small"
              className={`${control} hover:text-destructive`}
            >
              {removing ? 'Removing…' : 'Remove'}
            </button>
          ) : canReport ? (
            reported ? (
              // Not a disabled button. A disabled control is read out as one and
              // invites a second try; this is a statement of what has happened.
              <p className="font-semibold text-[0.75rem] text-grey">Reported</p>
            ) : (
              <button
                type="button"
                onClick={onReport}
                aria-label={`Report ${name}'s post`}
                data-target="small"
                className={`${control} hover:text-destructive`}
              >
                Report
              </button>
            )
          ) : null}
        </div>
      )}
      {likes?.failure && !editing ? (
        <p role="alert" className="mt-1.5 text-[0.78125rem] text-destructive leading-[1.45]">
          {likes.failure}
        </p>
      ) : null}

      {replies > 0 ? (
        <button
          type="button"
          onClick={() => {
            setHiddenAt(hidden ? null : replies);
          }}
          aria-expanded={!hidden}
          aria-controls={repliesId}
          aria-label={`${hidden ? 'Show' : 'Hide'} ${replies} ${replies === 1 ? 'reply' : 'replies'} to ${whose} post`}
          data-target="small"
          className={`mt-2 ${control} hover:text-navy`}
        >
          {hidden ? 'Show' : 'Hide'} {replies} {replies === 1 ? 'reply' : 'replies'}
        </button>
      ) : null}
      {replies > 0 ? (
        <div id={repliesId} hidden={hidden}>
          {children}
        </div>
      ) : null}
    </article>
  );
}
