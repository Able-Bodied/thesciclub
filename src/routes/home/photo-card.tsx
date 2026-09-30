import { Link } from 'react-router-dom';
import { LinkedText } from '@/components/linked-text';
import { FormerMemberAvatar, MemberAvatar } from '@/components/member-avatar';
import { chatTime } from '@/lib/chat/time';
import type { ChatAuthor } from '@/lib/chat/types';
import type { HomeTopic } from '@/lib/home/types';
import { AttachmentGrid } from '@/routes/chat/attachment-grid';
import { byline, RoomTag } from '@/routes/home/topic-card';

/**
 * A photograph on Home, from the mock's `postCard`: a topic whose first post
 * carries one.
 *
 * ---------------------------------------------------------------------------
 * Not one link, because it holds buttons
 * ---------------------------------------------------------------------------
 * Each photograph is a button that opens the viewer, and a button inside a
 * link is two controls fighting over one tap. So the parts are separate: the
 * name goes to the profile, the title and the replies go to the topic, and the
 * photographs open where they are. `AttachmentGrid` is Chat's own, unchanged.
 *
 * ---------------------------------------------------------------------------
 * No city
 * ---------------------------------------------------------------------------
 * The mock puts the poster's city under their name. `ChatAuthor` leaves it out
 * on purpose, so a member hidden from Peers is not placed on a map by
 * something they wrote. Do not add one.
 *
 * ---------------------------------------------------------------------------
 * A comment is a reply
 * ---------------------------------------------------------------------------
 * The mock opens a comments sheet. Here "Reply" goes to the topic page, which
 * already has the replies, the composer, Report, Remove and Mute. A second
 * list of the same replies would be a second place for each of those to go
 * wrong.
 */
export function PhotoCard({
  topic,
  author,
  linkState,
}: {
  topic: HomeTopic;
  /** Null for a former member, and while the name is still loading. */
  author: ChatAuthor | null;
  linkState: unknown;
}) {
  const opening = topic.opening;
  const to = `/chat/rooms/${topic.roomId}/topics/${topic.id}`;
  const name = byline(topic.authorId, author);

  return (
    <article className="rounded-[17px] border border-line bg-paper p-3.5">
      <div className="flex items-center gap-3">
        {/* Decorative: the link to the profile is on the name. */}
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
          <span className="block font-extrabold font-head text-[0.90625rem] text-ink">
            {author?.hasProfile ? (
              <Link
                to={`/peers/${author.id}`}
                state={linkState}
                data-target="small"
                className="underline-offset-2 hover:underline"
              >
                {name}
              </Link>
            ) : (
              name
            )}
          </span>
          <span className="block text-[0.78125rem] text-grey">
            {[author?.level, chatTime(topic.createdAt)].filter(Boolean).join(' · ')}
          </span>
        </span>
      </div>

      <div className="mt-2.5">
        <RoomTag room={topic.room} />
      </div>

      {opening ? <AttachmentGrid paths={opening.attachments} from={name} /> : null}

      <Link
        to={to}
        state={linkState}
        data-target="small"
        className="mt-2.5 block font-extrabold font-head text-[1rem] text-ink leading-[1.32] underline-offset-2 hover:underline"
      >
        {topic.title}
      </Link>
      {opening?.body ? (
        <p className="mt-1.5 line-clamp-4 whitespace-pre-line text-[0.875rem] text-ink leading-[1.52]">
          <LinkedText text={opening.body} />
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-line border-t pt-2">
        {topic.replyCount > 0 ? (
          <Link
            to={to}
            state={linkState}
            aria-label={`${topic.replyCount} ${topic.replyCount === 1 ? 'reply' : 'replies'} to ${topic.title}`}
            data-target="small"
            className="inline-flex min-h-[2.25rem] items-center font-semibold text-[0.8125rem] text-ink2 underline-offset-2 hover:underline"
          >
            {topic.replyCount} {topic.replyCount === 1 ? 'reply' : 'replies'}
          </Link>
        ) : null}
        {/* Named for the topic: a feed of cards each with a link called
            "Reply" is a links list of identical names. The visible word
            starts the name, so a voice user saying "Reply" still reaches it. */}
        <Link
          to={to}
          state={linkState}
          aria-label={`Reply to ${topic.title}`}
          data-target="small"
          className="inline-flex min-h-[2.25rem] items-center font-bold text-[0.8125rem] text-navy underline-offset-2 hover:underline"
        >
          Reply
        </Link>
      </div>
    </article>
  );
}
