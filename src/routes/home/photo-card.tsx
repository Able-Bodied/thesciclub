import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LinkedText } from '@/components/linked-text';
import { FormerMemberAvatar, MemberAvatar } from '@/components/member-avatar';
import { chatTime } from '@/lib/chat/time';
import type { ChatAuthor } from '@/lib/chat/types';
import type { HomeTopic } from '@/lib/home/types';
import { AttachmentGrid } from '@/routes/chat/attachment-grid';
import { PostLikes } from '@/routes/chat/like-button';
import { LinkPreviewCard } from '@/routes/chat/link-preview-card';
import { ViewCount } from '@/routes/chat/view-count';
import { byline, type CardLikes, RoomTag } from '@/routes/home/topic-card';

/**
 * A photograph on Home, from the mock's `postCard`: a topic whose first post
 * carries one.
 *
 * ---------------------------------------------------------------------------
 * Not one link, because it holds buttons
 * ---------------------------------------------------------------------------
 * Each photograph is a button that opens its topic, and a button inside a
 * link is two controls fighting over one tap. So the parts are separate: the
 * name goes to the profile, the title and the replies go to the topic, and the
 * photographs open the topic too. The title link stretches over the card
 * so its body and background also open it; independent controls sit above
 * that link.
 *
 * ---------------------------------------------------------------------------
 * A single photograph fills the card
 * ---------------------------------------------------------------------------
 * `AttachmentGrid` is Chat's, and at its default it sizes one photograph for a
 * bubble: its own shape, no taller than 20rem. In a card that is a picture in
 * the left half with blank beside it. So this card passes `fill`: one
 * photograph is the full width at the mock's shape, cropped, and whole in the
 * viewer. Two to four already fill the width and are drawn as Chat draws them.
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
 *
 * ---------------------------------------------------------------------------
 * A like is on the opening post
 * ---------------------------------------------------------------------------
 * HANDOFF.md "What Home is" step 3. The photograph is the opening post, so liking the card
 * likes that post, and the count here is the same rows the topic page counts
 * under it. Named for the topic's title, as Reply is. No opening post (it was
 * taken back) draws no likes, as it draws no photograph.
 */
export function PhotoCard({
  topic,
  author,
  linkState,
  likes,
  viewCount,
  reactions,
}: {
  topic: HomeTopic;
  /** Null for a former member, and while the name is still loading. */
  author: ChatAuthor | null;
  linkState: unknown;
  /** Who likes the opening post, as the topic page's posts take it. */
  likes?: CardLikes | undefined;
  viewCount?: number | null | undefined;
  reactions?: ReactNode;
}) {
  const navigate = useNavigate();
  const opening = topic.opening;
  const to = `/chat/rooms/${topic.roomId}/topics/${topic.id}`;
  const name = byline(topic.authorId, author);

  return (
    <article className="relative rounded-[17px] border border-line bg-paper p-3.5">
      <div className="flex items-center gap-3">
        {/* Decorative: the link to the profile is on the name. */}
        <span aria-hidden="true" className="pointer-events-none flex-none">
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
                className="relative z-[1] underline-offset-2 hover:underline"
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
        <RoomTag room={topic.room} linkState={linkState} />
      </div>

      {opening ? (
        <div className="relative z-[1]">
          <AttachmentGrid
            paths={opening.attachments}
            from={name}
            fill
            onOpen={() => {
              void navigate(to, { state: linkState });
            }}
            openLabel="Open the topic."
          />
        </div>
      ) : null}

      <Link
        to={to}
        state={linkState}
        data-target="small"
        className="mt-2.5 block font-extrabold font-head text-[1rem] text-ink leading-[1.32] underline-offset-2 hover:underline after:absolute after:inset-0 after:rounded-[17px]"
      >
        {topic.title}
      </Link>
      {opening?.body ? (
        <p className="mt-1.5 line-clamp-4 whitespace-pre-line text-[0.875rem] text-ink leading-[1.52] [&_a]:relative [&_a]:z-[1]">
          <LinkedText text={opening.body} />
        </p>
      ) : null}
      {opening?.linkPreview ? (
        <LinkPreviewCard preview={opening.linkPreview} className="relative" />
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-line border-t pt-2">
        {opening && likes ? (
          <PostLikes
            likedBy={likes.likedBy}
            readerId={likes.readerId}
            what={topic.title}
            onToggle={likes.onToggle}
            linkState={linkState}
            className="relative min-h-[2.25rem] text-[0.8125rem]"
            loading={likes.loading}
            unavailable={likes.unavailable}
          />
        ) : null}
        {opening ? <ViewCount count={viewCount} /> : null}
        {topic.replyCount > 0 ? (
          <Link
            to={to}
            state={linkState}
            aria-label={`${topic.replyCount} ${topic.replyCount === 1 ? 'reply' : 'replies'} to ${topic.title}`}
            data-target="small"
            className="relative inline-flex min-h-[2.25rem] items-center font-semibold text-[0.8125rem] text-ink2 underline-offset-2 hover:underline"
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
          className="relative inline-flex min-h-[2.25rem] items-center font-bold text-[0.8125rem] text-emphasis underline-offset-2 hover:underline"
        >
          Reply
        </Link>
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
