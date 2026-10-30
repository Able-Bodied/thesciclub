import { cloneElement, type ReactElement, type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { AvatarLink, FormerMemberAvatar, MemberAvatar } from '@/components/member-avatar';
import { PartnerLabel } from '@/components/partner-label';
import { chatTime } from '@/lib/chat/time';
import type { ChatAuthor, ChatEdit, ChatPost } from '@/lib/chat/types';
import { cn } from '@/lib/utils';
import { AttachmentGrid } from '@/routes/chat/attachment-grid';
import { EarlierVersions } from '@/routes/chat/earlier-versions';
import { PostLikes } from '@/routes/chat/like-button';
import { LinkPreviewCard } from '@/routes/chat/link-preview-card';
import { PostBody } from '@/routes/chat/post-body';
import type { ReactionBarProps } from '@/routes/chat/reaction-bar';
import { ReportControl } from '@/routes/chat/report-control';
import { ViewCount } from '@/routes/chat/view-count';

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
 * Like, its count and views first, then Save (private, 2026-10-20), Edit
 * and Reply since 2026-09-29 (decisions 9 and 11), then Remove, or Report, or nothing. Report sits exactly where Remove sits, and
 * never beside it: the reader can take back what they wrote; on somebody
 * else's post they can hand it to the administrators. An administrator gets
 * Remove on everything, which is the stronger of the two — offering them
 * Report as well would be offering them a complaint addressed to themselves.
 * Edit is the author's alone, an administrator included: an administrator
 * removes, and does not rewrite somebody's words in their name. Block comes
 * last, on somebody else's (the owner, 2026-10-22).
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
 * Editing is the composer at the foot of the topic
 * ---------------------------------------------------------------------------
 * Pressing Edit puts the words in the topic's composer and outlines the post
 * meanwhile. An edit changes the words only. "Edited · 9:30am" sits under the
 * body afterwards, for everybody; an administrator also gets the earlier
 * versions, under a disclosure, from chat_edits.
 *
 * ---------------------------------------------------------------------------
 * Replies sit under the post they answer
 * ---------------------------------------------------------------------------
 * The topic page hands a top-level post its replies as `children`, drawn
 * inside the article, indented and unnumbered. Each reply can hold its own
 * conversation, and Reply answers that specific post (owner, 2026-10-09).
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
  depth = 1,
  canEdit,
  appendOnly = false,
  removeLabel,
  editing,
  onEdit,
  canReply = false,
  onReply,
  canRemove,
  onRemove,
  removing,
  canReport,
  reported,
  onReport,
  onBlock,
  share,
  edits,
  likes,
  viewCount,
  reactions,
  save,
  replies = 0,
  flash = false,
  hideBody = false,
  opening = false,
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
  /** Indentation stops after four levels to leave room for words on phones. */
  depth?: number;
  /** The reader's own standing post. */
  canEdit: boolean;
  /** Somebody has replied: its words stay, and Edit adds an update. */
  appendOnly?: boolean;
  /** In place of Remove, e.g. Delete topic for an unanswered topic's opening post. */
  removeLabel?: string | undefined;
  /** Its words are in the composer. */
  editing: boolean;
  onEdit: () => void;
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
  /** Somebody else's post, by a member not yet blocked. Absent draws no Block. */
  onBlock?: (() => void) | undefined;
  /** Share into a conversation (share-post.tsx). Absent draws none. */
  share?: ReactNode;
  /** Earlier versions, for an administrator. Absent or empty for everybody else. */
  edits?: ChatEdit[];
  /**
   * Who likes it, and what pressing Like does. Absent draws no likes at all —
   * while they have not loaded, or where a screen does not read them.
   */
  likes?:
    | {
        likedBy: readonly string[];
        /** The signed-in reader, including the post's author. */
        readerId: string | null;
        onToggle: () => void;
        /** The sentence for a like that did not land on this post, or null. */
        failure: string | null;
        loading?: boolean | undefined;
        unavailable?: boolean | undefined;
      }
    | undefined;
  /** Distinct members delivered this post, including zero. */
  viewCount?: number | null | undefined;
  reactions?: ReactElement<ReactionBarProps>;
  /** The reader's private save of this post. Absent draws no Save. */
  save?: { saved: boolean; onToggle: () => void; failure: string | null } | undefined;
  /** How many replies `children` holds, for the hide control. */
  replies?: number;
  /** Lit up once: the post a notification or a link was about. */
  flash?: boolean;
  /**
   * The post is the topic's title already, word for word: a question asked
   * with no details. The page's header says the question, who asked it and
   * when, so this draws only what can be done to it (likes, reply, remove)
   * as a row under the header: no second card with the asker's name over
   * nothing, and no Edit, which would edit a copy of the title.
   */
  hideBody?: boolean;
  /**
   * The topic's own first post: drawn under the title as part of the topic,
   * not as a card that reads like an answer. The header names who started it.
   */
  opening?: boolean;
  /** The replies, as `<Post nested>` elements. */
  children?: ReactNode;
}) {
  // The count the replies were hidden at, or null. See the header.
  const [hiddenAt, setHiddenAt] = useState<number | null>(null);
  const hidden = replies > 0 && hiddenAt === replies;
  const repliesId = `replies-${post.id}`;
  const name = author ? author.displayName : 'a deleted member';
  const whose = canEdit ? 'your' : `${name}'s`;
  const control =
    'font-semibold text-[0.75rem] text-grey underline decoration-line underline-offset-2';

  const reply = canReply ? (
    <button
      type="button"
      onClick={onReply}
      aria-label={`Reply to ${whose} post`}
      className="relative inline-flex min-h-11 items-center rounded-full px-3 text-[0.6875rem] text-grey hover:bg-tint"
    >
      Reply
    </button>
  ) : null;

  const controls = (
    <>
      {save ? (
        <button
          type="button"
          onClick={save.onToggle}
          aria-pressed={save.saved}
          aria-label={save.saved ? `Remove ${whose} post from Saved` : `Save ${whose} post`}
          data-target="small"
          className={`${control} hover:text-emphasis`}
        >
          {save.saved ? 'Remove from Saved' : 'Save post'}
        </button>
      ) : null}
      {canEdit && !editing ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={
            hideBody
              ? 'Add details to your post'
              : appendOnly
                ? 'Add an update to your post'
                : 'Edit your post'
          }
          data-target="small"
          className={`${control} hover:text-emphasis`}
        >
          {/* A topic posted with only its title has no words of its own to edit. */}
          {hideBody ? 'Add details' : appendOnly ? 'Add an update' : 'Edit'}
        </button>
      ) : null}
      {canRemove ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          aria-label={removeLabel ?? `Remove ${whose} post`}
          data-target="small"
          className={`${control} hover:text-destructive`}
        >
          {removing ? 'Removing…' : (removeLabel ?? 'Remove')}
        </button>
      ) : canReport ? (
        <ReportControl
          reported={reported}
          label={`Report ${name}'s post`}
          onReport={onReport}
          buttonClassName={`${control} hover:text-destructive`}
          noteClassName="font-semibold text-[0.75rem] text-grey"
        />
      ) : null}
      {onBlock ? (
        <button
          type="button"
          onClick={onBlock}
          data-target="small"
          className={`${control} hover:text-destructive`}
        >
          Block {name}
        </button>
      ) : null}
    </>
  );

  return (
    <article
      // The address a notification points into: ?post=<id> on the topic.
      id={`post-${post.id}`}
      // Focusable from script only, so a screen reader arriving from a
      // notification starts on the post it was about. The flash marks it.
      tabIndex={-1}
      className={cn(
        hideBody || opening
          ? 'mb-2.5 border-line border-b pb-2.5'
          : nested
            ? depth <= 4
              ? 'mt-2.5 rounded-bl-xl border-line border-l-2 pl-3'
              : 'mt-2.5'
            : 'mb-2.5 rounded-[15px] border border-line bg-paper px-3.5 py-[13px]',
        editing ? 'outline-2 outline-emphasis outline-offset-2' : 'outline-none',
        flash && 'message-flash',
      )}
    >
      {hideBody || opening ? (
        <h2 className="sr-only">{hideBody ? 'The question' : 'The topic'}</h2>
      ) : (
        <div className="flex items-center gap-2.5">
          <AvatarLink memberId={author?.id} hasProfile={author?.hasProfile}>
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
          </AvatarLink>

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
                'Deleted member'
              )}
              {author?.level ? (
                <span className="ml-[7px] font-semibold text-[0.78125rem] text-grey">
                  {author.level}
                </span>
              ) : null}
            </span>
            <PartnerLabel memberId={author?.id} />
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
      )}

      {post.body && !hideBody ? (
        // Formatted (the owner, 2026-10-11): the first post's toolbar writes
        // a small Markdown (lib/markdown.ts), shown through the same allowlist
        // as an event's description. Plain text reads as it did: its line
        // breaks and its addresses as links. An @name links to its member.
        <PostBody
          text={post.body}
          className="mt-2 text-[0.875rem] text-ink leading-[1.5] [overflow-wrap:anywhere] [&>*+*]:mt-2 [&_a]:font-semibold [&_a]:underline [&_a]:underline-offset-2 [&_h3]:font-extrabold [&_h3]:font-head [&_h3]:text-[0.96875rem] [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc"
        />
      ) : null}
      {post.attachments.length > 0 ? (
        <AttachmentGrid paths={post.attachments} from={author?.displayName ?? 'a deleted member'} />
      ) : null}
      {post.linkPreview ? <LinkPreviewCard preview={post.linkPreview} /> : null}
      {post.editedAt ? (
        <p className="mt-1 text-[0.78125rem] text-grey">Edited · {chatTime(post.editedAt)}</p>
      ) : null}
      {edits && edits.length > 0 ? <EarlierVersions edits={edits} from={name} /> : null}

      <div
        className={cn('flex flex-wrap items-center gap-x-3.5 gap-y-1', hideBody ? 'mt-0' : 'mt-2')}
      >
        {likes ? (
          <PostLikes
            likedBy={likes.likedBy}
            readerId={likes.readerId}
            what={`${whose} post`}
            onToggle={likes.onToggle}
            className="text-[0.75rem]"
            loading={likes.loading}
            unavailable={likes.unavailable}
          />
        ) : null}
        <ViewCount count={viewCount} postId={post.id} />
        {reactions ? (
          cloneElement(reactions, { compact: true, actions: controls, reply, share })
        ) : (
          <>
            {reply}
            {share}
            {controls}
          </>
        )}
      </div>
      {likes?.failure ? (
        <p role="alert" className="mt-1.5 text-[0.78125rem] text-destructive leading-[1.45]">
          {likes.failure}
        </p>
      ) : null}
      {save?.failure ? (
        <p role="alert" className="mt-1.5 text-[0.78125rem] text-destructive leading-[1.45]">
          {save.failure}
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
          className={`mt-2 ${control} hover:text-emphasis`}
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
