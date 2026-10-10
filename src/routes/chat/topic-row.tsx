import { Link } from 'react-router-dom';
import { FormerMemberAvatar, MemberAvatar } from '@/components/member-avatar';
import { chatTime } from '@/lib/chat/time';
import type { ChatAuthor, ChatTopic } from '@/lib/chat/types';
import { PostLikes } from '@/routes/chat/like-button';
import type { CardLikes } from '@/routes/home/topic-card';

/**
 * One topic in a room's list, from the mock's `topicRow()`.
 *
 * The faces are the first four people to post, which the database returns with
 * the row — a stack of tiles answers "is this a conversation or one person
 * asking" before any of the words are read, and it is the reason to have a
 * stack rather than a number.
 *
 * Unread is a weight and a dot, not a colour on its own: the whole row is
 * already dark ink on paper, and a member who cannot tell two greys apart
 * should still be able to see which topics are new.
 */
export function TopicRow({
  topic,
  authors,
  likes,
}: {
  topic: ChatTopic;
  authors: Map<string, ChatAuthor>;
  likes?: CardLikes | undefined;
}) {
  const faces = topic.participantIds.slice(0, 4);

  return (
    <article className="relative mb-2.5 block rounded-[15px] border border-line bg-paper px-3.5 py-[13px]">
      <span className="flex items-start gap-2">
        {topic.unread ? (
          <span
            // Decorative — "New" is in the label below, where a screen reader
            // gets it as words.
            aria-hidden="true"
            className="mt-[7px] h-[7px] w-[7px] flex-none rounded-full bg-emphasis"
          />
        ) : null}
        <Link
          to={`/chat/rooms/${topic.roomId}/topics/${topic.id}`}
          className="min-w-0 flex-1 after:absolute after:inset-0 after:content-[''] font-extrabold font-head text-[0.96875rem] text-ink leading-[1.34]"
        >
          {topic.unread ? <span className="sr-only">New. </span> : null}
          {topic.title}
        </Link>
      </span>

      <span className="mt-2.5 flex items-center gap-2.5">
        {/* Decorative. The faces answer "is this a conversation or one person
            asking" at a glance and nothing else; their initials read as a run
            of stray letters in the middle of the row's label. */}
        <span aria-hidden="true" className="flex flex-none">
          {faces.map((id, index) => {
            const author = authors.get(id);
            return (
              <span key={id} className={index > 0 ? '-ml-2' : ''}>
                {author ? (
                  <MemberAvatar
                    id={author.id}
                    displayName={author.displayName}
                    photoPath={author.photoPath}
                    photoAlt={author.photoAlt}
                    className="ring-2 ring-paper"
                  />
                ) : (
                  <FormerMemberAvatar className="ring-2 ring-paper" />
                )}
              </span>
            );
          })}
        </span>

        <span className="flex flex-wrap items-baseline gap-x-1 text-[0.775rem] text-grey">
          {topic.replyCount > 0 ? (
            <>
              <b className="font-extrabold font-head text-[0.8375rem] text-emphasis">
                {topic.replyCount}
              </b>
              <i className="mr-[9px] not-italic">{topic.replyCount === 1 ? 'reply' : 'replies'}</i>
            </>
          ) : null}
          <b className="font-extrabold font-head text-[0.8375rem] text-emphasis">
            {topic.viewCount}
          </b>
          <i className="mr-[9px] not-italic">{topic.viewCount === 1 ? 'view' : 'views'}</i>
          <b className="font-extrabold font-head text-[0.8375rem] text-emphasis">
            {chatTime(topic.lastPostAt)}
          </b>
        </span>
      </span>
      {likes ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <PostLikes
            likedBy={likes.likedBy}
            readerId={likes.readerId}
            what={topic.title}
            onToggle={likes.onToggle}
            className="relative min-h-[2.25rem] text-[0.8125rem]"
            loading={likes.loading}
            unavailable={likes.unavailable}
          />
        </div>
      ) : null}
      {likes?.failure ? (
        <p role="alert" className="relative mt-1 text-[0.78125rem] text-destructive">
          {likes.failure}
        </p>
      ) : null}
    </article>
  );
}
