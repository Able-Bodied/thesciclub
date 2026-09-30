import { Link } from 'react-router-dom';
import { FormerMemberAvatar, MemberAvatar } from '@/components/member-avatar';
import { chatTime } from '@/lib/chat/time';
import type { ChatAuthor, ChatRoom } from '@/lib/chat/types';
import type { HomeTopic } from '@/lib/home/types';
import { ROOM_ICON_COLOUR } from '@/routes/chat/continue-in-room';

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
}: {
  topic: HomeTopic;
  /** Null for a former member, and while the name is still loading. */
  starter: ChatAuthor | null;
  replier: ChatAuthor | null;
  /** Router state for the topic page, so its back link can say Home. */
  linkState: unknown;
}) {
  const reply = topic.firstReply;

  return (
    <article className="relative rounded-[17px] border border-line bg-paper p-3.5">
      <RoomTag room={topic.room} />

      <Link
        to={`/chat/rooms/${topic.roomId}/topics/${topic.id}`}
        state={linkState}
        className="mt-2 block font-extrabold font-head text-[1rem] text-ink leading-[1.32] after:absolute after:inset-0 after:rounded-[17px]"
      >
        {topic.title}
      </Link>

      <p className="mt-[7px] text-[0.8125rem] text-ink2 leading-[1.42]">
        {byline(topic.authorId, starter)}
        {starter?.level ? ` · ${starter.level}` : ''} · {chatTime(topic.createdAt)}
      </p>

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
        </div>
      ) : null}

      <p className="mt-2.5 font-semibold text-[0.78125rem] text-navy">
        {topic.replyCount > 0
          ? `${topic.replyCount} ${topic.replyCount === 1 ? 'reply' : 'replies'}`
          : 'No replies yet.'}
      </p>
    </article>
  );
}

/**
 * A name, "Former member", or an ellipsis while the name is on its way.
 *
 * The last is not "Former member": an author id that has not been looked up
 * yet is somebody still in the club, and calling them former for half a
 * second says something untrue about a real person.
 */
export function byline(authorId: string | null, author: ChatAuthor | null): string {
  if (author) return author.displayName;
  return authorId ? '…' : 'Former member';
}

/**
 * The room a topic lives in: its glyph in its heading's colour, and its name.
 *
 * A room a member started has no glyph, and gets the first letter of its name
 * in the same place, as its card in Chat does.
 */
export function RoomTag({ room }: { room: ChatRoom }) {
  return (
    <p className="flex items-center gap-1.5 font-bold text-[0.71875rem] text-navy-hi uppercase tracking-[0.07em]">
      <span
        aria-hidden="true"
        className={`w-[1.2em] flex-none text-center text-[1rem] normal-case leading-none ${ROOM_ICON_COLOUR[room.category]}`}
      >
        {room.icon ?? room.name.charAt(0)}
      </span>
      <span className="min-w-0">{room.name}</span>
    </p>
  );
}
