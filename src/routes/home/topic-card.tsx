import { Link } from 'react-router-dom';
import { FormerMemberAvatar, MemberAvatar } from '@/components/member-avatar';
import { chatTime } from '@/lib/chat/time';
import type { ChatAuthor, ChatRoom } from '@/lib/chat/types';
import type { HomeTopic } from '@/lib/home/types';
import { ROOM_ICON_COLOUR } from '@/routes/chat/continue-in-room';
import { PostLikes } from '@/routes/chat/like-button';
import { LinkPreviewCard } from '@/routes/chat/link-preview-card';
import { AnswerBox } from '@/routes/home/answer-box';

/**
 * A topic on Home, from the mock's `qCard`.
 *
 * The room, the title, who asked and when, and the first reply, so the card
 * answers "is anybody talking about this" before it is opened. It goes to the
 * topic page, which is the question page: Home draws no second view of a
 * topic's replies.
 *
 * ---------------------------------------------------------------------------
 * The whole card is a target, and only the title is the link's name
 * ---------------------------------------------------------------------------
 * The link is on the title and stretched over the card by a pseudo-element,
 * so a tap anywhere opens the topic. What a screen reader reads as the link is
 * the title alone, not the room, the byline and four lines of somebody's
 * reply run together, which is what a whole-card link would announce every
 * time focus reached it. The rest is read as ordinary text.
 *
 * ---------------------------------------------------------------------------
 * Like sits above the stretched link, and nothing else does
 * ---------------------------------------------------------------------------
 * HANDOFF.md "What Home is" step 3b: Like on every topic card, liking the opening post as
 * the photo card does. The link's pseudo-element covers the card, so a button
 * under it cannot be pressed — the tap lands on the link and opens the topic.
 * The two buttons are `relative`, which paints them after the pseudo-element
 * (positioned boxes paint in document order) and so on top of it. Not the row
 * around them: its gaps and the reply count should still open the topic.
 *
 * Not the plan's `relative z-10` on the row. A z-index makes a stacking
 * context, and the list of who liked it is a `fixed` sheet drawn inside the
 * row, by `PostLikes`: trapped at z-10, it opened under the tab bar and under
 * the next card's buttons, which covered its Close (seen in a browser,
 * 2026-09-30). Plain `relative` makes none.
 *
 * ---------------------------------------------------------------------------
 * No count of zero
 * ---------------------------------------------------------------------------
 * "No replies yet." is information about a question somebody asked. "0
 * replies" reads as a failure.
 */
export function TopicCard({
  topic,
  starter,
  replier,
  linkState,
  likes,
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
  /** The member reading, who can answer a question from here. */
  answerAs?: string | null | undefined;
}) {
  const reply = topic.firstReply;
  const opening = topic.opening;

  return (
    <article className="relative rounded-[17px] border border-line bg-paper p-3.5">
      <RoomTag room={topic.room} linkState={linkState} />

      {topic.isQuestion ? (
        /* A question asked as one, drawn the way the owner pointed at
           (Facebook's coloured posts): large, centred, on the header band's
           colour, so it reads as something to answer rather than a headline
           to scroll past. White on the plate in both appearances; the text
           size is the member's, never shrunk to fit. */
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
          className="mt-2 block font-extrabold font-head text-[1rem] text-ink leading-[1.32] after:absolute after:inset-0 after:rounded-[17px]"
        >
          {topic.title}
        </Link>
      )}

      <p className="mt-[7px] text-[0.8125rem] text-ink2 leading-[1.42]">
        {byline(topic.authorId, starter)}
        {starter?.level ? ` · ${starter.level}` : ''} · {chatTime(topic.createdAt)}
      </p>

      {/* `relative`, like the Like control: above the title's stretched
          link, so the card's own link and play button can be pressed. */}
      {opening?.linkPreview ? (
        <LinkPreviewCard preview={opening.linkPreview} className="relative" />
      ) : null}

      {reply ? (
        <div className="mt-[11px] border-tint border-l-[2.5px] py-0.5 pl-3">
          <p className="flex items-center gap-[9px]">
            {/* Decorative: the name is beside it. */}
            <span aria-hidden="true" className="flex-none">
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
            </span>
            <span className="font-semibold text-[0.78125rem] text-ink2">
              {byline(reply.authorId, replier)}
              {replier?.level ? ` · ${replier.level}` : ''}
            </span>
          </p>
          <p className="mt-1.5 line-clamp-4 whitespace-pre-line text-[0.875rem] text-ink2 leading-[1.52]">
            {reply.body || 'Replied with a photograph.'}
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
          />
        ) : null}
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
    </article>
  );
}

/** What a card's Like needs: the topic page's posts take the same. */
export interface CardLikes {
  likedBy: readonly string[];
  /** The reader, or null on their own topic, where only the count is drawn. */
  readerId: string | null;
  onToggle: () => void;
  failure: string | null;
}

/**
 * A name, "Deleted member", or an ellipsis while the name is on its way.
 *
 * The last is not "Deleted member": an author id that has not been looked up
 * yet is somebody still in the club, and calling them former for half a
 * second says something untrue about a real person.
 */
export function byline(authorId: string | null, author: ChatAuthor | null): string {
  if (author) return author.displayName;
  return authorId ? '…' : 'Deleted member';
}

/**
 * The room a topic lives in: its glyph in its heading's colour, and its name.
 *
 * A room a member started has no glyph, and gets the first letter of its name
 * in the same place, as its card in Chat does.
 */
export function RoomTag({ room, linkState }: { room: ChatRoom; linkState?: unknown }) {
  return (
    <p className="flex items-center gap-1.5 font-bold text-[0.71875rem] text-emphasis uppercase tracking-[0.07em]">
      <span
        aria-hidden="true"
        className={`w-[1.2em] flex-none text-center text-[1rem] normal-case leading-none ${ROOM_ICON_COLOUR[room.category]}`}
      >
        {room.icon ?? room.name.charAt(0)}
      </span>
      {/* To the room, and its other topics (the owner, 2026-10-09).
          The title's link is stretched over the whole card by an ::after
          that comes later in the page, so it is drawn on top of anything
          earlier with no z-index: `relative` alone left the name under it,
          and a press opened the topic. z-[1] puts the name above it. */}
      <Link
        to={`/chat/rooms/${room.id}`}
        state={linkState}
        data-target="small"
        className="relative z-[1] min-w-0 rounded py-1 underline-offset-2 hover:underline"
      >
        {room.name}
      </Link>
    </p>
  );
}
