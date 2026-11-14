import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LinkedText } from '@/components/linked-text';
import { AvatarLink, FormerMemberAvatar, MemberAvatar } from '@/components/member-avatar';
import { useSeenOnHome } from '@/lib/chat/home-views';
import { chatTime } from '@/lib/chat/time';
import type { ChatAuthor, ChatRoom } from '@/lib/chat/types';
import type { HomeTopic } from '@/lib/home/types';
import { markdownToPlain } from '@/lib/markdown';
import { ROOM_ICON_COLOUR } from '@/routes/chat/continue-in-room';
import { PostLikes } from '@/routes/chat/like-button';
import { LinkPreviewCard } from '@/routes/chat/link-preview-card';
import { ViewCount } from '@/routes/chat/view-count';
import { AnswerBox } from '@/routes/home/answer-box';

/**
 * A topic on Home (the mock's `qCard`): room, title, byline and first reply. Opens the topic page.
 *
 * The title's link is stretched over the card by a pseudo-element, so a tap anywhere opens it but
 * a screen reader names the link by the title alone.
 *
 * Like (HANDOFF.md "What Home is" step 3b) is `relative`, painting it above the stretched link;
 * the row is not, so its gaps still open the topic. No z-index: it makes a stacking context that
 * trapped `PostLikes`'s `fixed` sheet under the tab bar (2026-09-30).
 *
 * "No replies yet.", never "0 replies", which reads as a failure.
 */
export function TopicCard({
  topic,
  starter,
  replier,
  linkState,
  likes,
  viewCount,
  reactions,
  answerAs,
}: {
  topic: HomeTopic;
  /** Null for a former member, and while the name is still loading. */
  starter: ChatAuthor | null;
  replier: ChatAuthor | null;
  /** Router state for the topic page, so its back link can say Home. */
  linkState: unknown;
  /** Who likes the opening post, or nothing while the likes load. */
  likes?: CardLikes | undefined;
  viewCount?: number | null | undefined;
  reactions?: ReactNode;
  /** The member reading, who can answer a question from here. */
  answerAs?: string | null | undefined;
}) {
  const reply = topic.firstReply;
  const opening = topic.opening;
  // Read here is read: a view, as opening the topic is (home-views.ts).
  const seenRef = useSeenOnHome(topic.opening?.id);

  return (
    <article ref={seenRef} className="relative rounded-[17px] border border-line bg-paper p-3.5">
      <RoomTag room={topic.room} linkState={linkState} />

      {topic.isQuestion ? (
        /* A question, large on the header band's colour like Facebook's coloured posts (the
           owner's pick). The text size is the member's, never shrunk to fit. */
        <Link
          to={`/chat/rooms/${topic.roomId}/topics/${topic.id}`}
          state={linkState}
          // The outline is for dark, where the band is close to the card.
          className="mt-2.5 block rounded-[14px] bg-gradient-to-br from-plate to-plate-hover px-4 pt-3.5 pb-6 text-center text-white ring-1 ring-plate-edge/50 ring-inset after:absolute after:inset-0 after:rounded-[17px]"
        >
          <span className="block text-left font-bold text-[0.6875rem] text-gold-hi uppercase tracking-[0.12em]">
            Question
          </span>
          <span className="mt-3 block font-extrabold font-head text-[1.375rem] leading-[1.3] [overflow-wrap:anywhere]">
            {topic.title}
          </span>
        </Link>
      ) : (
        <Link
          to={`/chat/rooms/${topic.roomId}/topics/${topic.id}`}
          state={linkState}
          className="mt-2 block font-extrabold font-head text-[1rem] text-ink leading-[1.32] [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-[17px]"
        >
          {topic.title}
        </Link>
      )}

      {/* Who asked, with their picture (owner, 2026-10-10), the same size
          and shape as the first reply's below so the two read as a pair. */}
      <p className="mt-2 flex items-center gap-[9px] text-[0.8125rem] text-ink2 leading-[1.42]">
        {/* Above the title's stretched link, so a tap on it opens their profile. */}
        <AvatarLink
          memberId={starter?.id}
          hasProfile={starter?.hasProfile}
          state={linkState}
          className="relative z-[1]"
        >
          {starter ? (
            <MemberAvatar
              id={starter.id}
              displayName={starter.displayName}
              photoPath={starter.photoPath}
              photoAlt={starter.photoAlt}
              className="h-[1.75rem] w-[1.75rem] rounded-[9px] text-[0.6875rem]"
            />
          ) : (
            <FormerMemberAvatar className="h-[1.75rem] w-[1.75rem] rounded-[9px] text-[0.6875rem]" />
          )}
        </AvatarLink>
        <span className="min-w-0">
          <BylineName authorId={topic.authorId} author={starter} linkState={linkState} />
          {starter?.level ? ` · ${starter.level}` : ''} · {chatTime(topic.createdAt)}
        </span>
      </p>

      {/* `relative`, like the Like control: above the title's stretched
          link, so the card's own link and play button can be pressed. */}
      {opening?.linkPreview ? (
        <LinkPreviewCard preview={opening.linkPreview} className="relative" />
      ) : null}

      {reply ? (
        <div className="mt-[11px] border-tint border-l-[2.5px] py-0.5 pl-3">
          <p className="flex items-center gap-[9px]">
            <AvatarLink
              memberId={replier?.id}
              hasProfile={replier?.hasProfile}
              state={linkState}
              className="relative z-[1]"
            >
              {replier ? (
                <MemberAvatar
                  id={replier.id}
                  displayName={replier.displayName}
                  photoPath={replier.photoPath}
                  photoAlt={replier.photoAlt}
                  className="h-[1.75rem] w-[1.75rem] rounded-[9px] text-[0.6875rem]"
                />
              ) : (
                <FormerMemberAvatar className="h-[1.75rem] w-[1.75rem] rounded-[9px] text-[0.6875rem]" />
              )}
            </AvatarLink>
            <span className="font-semibold text-[0.78125rem] text-ink2">
              <BylineName authorId={reply.authorId} author={replier} linkState={linkState} />
              {replier?.level ? ` · ${replier.level}` : ''}
            </span>
          </p>
          <p className="mt-1.5 line-clamp-4 whitespace-pre-line text-[0.875rem] text-ink2 leading-[1.52] [&_a]:relative [&_a]:z-[1]">
            {reply.body ? (
              <LinkedText text={markdownToPlain(reply.body)} />
            ) : (
              'Replied with a photograph.'
            )}
          </p>
          {reply.linkPreview ? (
            <LinkPreviewCard preview={reply.linkPreview} className="relative" />
          ) : null}
        </div>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        {opening && likes ? (
          <PostLikes
            likedBy={likes.likedBy}
            readerId={likes.readerId}
            what={topic.title}
            onToggle={likes.onToggle}
            linkState={linkState}
            // `relative` is what lets them be pressed. See the header.
            className="relative min-h-[2.25rem] text-[0.8125rem]"
            loading={likes.loading}
            unavailable={likes.unavailable}
          />
        ) : null}
        {opening ? <ViewCount count={viewCount} postId={opening.id} /> : null}
        <p className="font-semibold text-[0.78125rem] text-emphasis">
          {topic.replyCount > 0
            ? `${topic.replyCount} ${topic.replyCount === 1 ? 'reply' : 'replies'}`
            : 'No replies yet.'}
        </p>
        {/* A question can be answered from Home, in the card. */}
        {topic.isQuestion && answerAs ? (
          <AnswerBox
            topicId={topic.id}
            roomId={topic.roomId}
            title={topic.title}
            answerAs={answerAs}
            linkState={linkState}
          />
        ) : null}
      </div>
      {opening && likes?.failure ? (
        <p role="alert" className="mt-1 text-[0.78125rem] text-destructive leading-[1.45]">
          {likes.failure}
        </p>
      ) : null}
      {reactions}
    </article>
  );
}

/** What a card's Like needs: the topic page's posts take the same. */
export interface CardLikes {
  likedBy: readonly string[];
  /** The signed-in reader, including the author of this topic. */
  readerId: string | null;
  onToggle: () => void;
  failure: string | null;
  loading?: boolean | undefined;
  unavailable?: boolean | undefined;
}

/**
 * A name, "Deleted member", or an ellipsis while loading: an id not yet looked up is a current
 * member, never to be called former.
 */
export function byline(authorId: string | null, author: ChatAuthor | null): string {
  if (author) return author.displayName;
  return authorId ? '…' : 'Deleted member';
}

/** The name in a byline, above the title's stretched link, as the picture beside it is. */
function BylineName({
  authorId,
  author,
  linkState,
}: {
  authorId: string | null;
  author: ChatAuthor | null;
  linkState: unknown;
}) {
  const name = byline(authorId, author);
  if (!author?.hasProfile) return name;
  return (
    <Link
      to={`/peers/${author.id}`}
      state={linkState}
      data-target="small"
      className="relative z-[1] underline-offset-2 hover:underline"
    >
      {name}
    </Link>
  );
}

/** A topic's room: its glyph (or first letter, for a member's room) and its name. */
export function RoomTag({ room, linkState }: { room: ChatRoom; linkState?: unknown }) {
  return (
    <p className="flex items-center gap-1.5 font-bold text-[0.71875rem] text-emphasis uppercase tracking-[0.07em]">
      {/* To the room (the owner, 2026-10-09). z-[1]: the title's later ::after covers
          earlier `relative` boxes, so without it a press opened the topic. */}
      <Link
        to={`/chat/rooms/${room.id}`}
        state={linkState}
        data-target="small"
        className="relative z-[1] inline-flex min-w-0 items-center gap-1.5 rounded py-1 underline-offset-2 hover:underline"
      >
        <span
          aria-hidden="true"
          className={`w-[1.2em] flex-none text-center text-[1rem] normal-case leading-none ${ROOM_ICON_COLOUR[room.category]}`}
        >
          {room.icon ?? room.name.charAt(0)}
        </span>
        {room.name}
      </Link>
    </p>
  );
}
