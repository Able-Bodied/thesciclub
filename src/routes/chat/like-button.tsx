import { ThumbsUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MemberAvatar } from '@/components/member-avatar';
import { useChatAuthors } from '@/lib/chat/authors';
import { likesLabel } from '@/lib/chat/likes';
import { useDialogFocus } from '@/lib/dialog-focus';
import { cn } from '@/lib/utils';

/**
 * Likes on a post: the Like button, the count beside it, and the list of who.
 *
 * The owner, 2026-09-29 (HANDOFF.md "What Home is" decision 4): likes with names shown.
 * Drawn under every post in a topic and on a photograph on Home, from
 * `PostLikes` in both places, so the two cannot drift into disagreeing about
 * what the states are called or what the count opens.
 *
 * ---------------------------------------------------------------------------
 * The label says the state, and the name says the post
 * ---------------------------------------------------------------------------
 * As `follow-button.tsx`: the visible word is the state, "Like" then "Liked",
 * `aria-pressed` carries it, and the accessible name says what pressing does.
 * The name also says which post — "Like Jan's post", "3 likes on Jan's post"
 * — for the reason post.tsx gives: a topic of twenty posts is otherwise a
 * column of twenty identical buttons in a screen reader's list. The owner
 * chose that over the plan's bare "Like" on 2026-09-30. The visible word
 * starts the name, so a voice user saying "Like" still reaches it.
 *
 * ---------------------------------------------------------------------------
 * Not on your own post; the count is
 * ---------------------------------------------------------------------------
 * Nobody likes their own words (the insert policy refuses it), so the button
 * is not drawn there. The count still is: who liked what you wrote is the
 * part worth seeing. A count of zero is not drawn anywhere.
 *
 * ---------------------------------------------------------------------------
 * The list is a dialog
 * ---------------------------------------------------------------------------
 * Built like report-sheet.tsx: `role="dialog"`, `aria-modal`, and three ways
 * out — Close, the backdrop and Escape. Its focus is `useDialogFocus`: to its
 * heading when it opens, round its own links and buttons, and back on the
 * count that opened it when it closes. The count is also focused by name on
 * close, because Safari does not focus a button that is clicked, so the hook
 * may have nothing to go back to. `fixed` rather than report-sheet's `absolute`, because it is
 * opened from inside a card or a post rather than from the page, as the
 * photograph viewer is. The line under the title says who else can see it,
 * because a name on a list is a thing somebody should know is public to the
 * room before they press Like.
 */

/** Sized in em off its own letters, so it grows with the text-size setting. */
const CONTROL = 'inline-flex items-center gap-[0.35em] font-bold font-head leading-[1.3]';

export function LikeButton({
  liked,
  what,
  onToggle,
  className,
}: {
  liked: boolean;
  /** What is being liked, for the name: "Jan's post", or a topic's title. */
  what: string;
  onToggle: () => void;
  className?: string | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={liked}
      // Named for the action, because the visible label is the state.
      aria-label={liked ? `Liked ${what}. Press to take it back.` : `Like ${what}`}
      data-target="small"
      className={cn(
        CONTROL,
        'transition-colors',
        liked ? 'text-emphasis' : 'text-ink2 hover:text-emphasis',
        className,
      )}
    >
      {/* Filled when liked. The mock fills it with a pale tint, which on paper
          is next to invisible; the word carries the state for everybody, and
          a solid thumb carries it at a glance too. */}
      <ThumbsUp
        aria-hidden="true"
        className={cn('h-[1.15em] w-[1.15em] flex-none', liked ? 'fill-current' : 'fill-none')}
      />
      {liked ? 'Liked' : 'Like'}
    </button>
  );
}

export function PostLikes({
  likedBy,
  readerId,
  what,
  onToggle,
  linkState,
  className,
}: {
  /** Member ids, oldest like first. */
  likedBy: readonly string[];
  /** The reader, or null when their own post and the button is not drawn. */
  readerId: string | null;
  what: string;
  onToggle: () => void;
  /** Handed to the profile links in the list, so Back returns here. */
  linkState?: unknown;
  className?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const count = useRef<HTMLButtonElement | null>(null);
  const total = likedBy.length;

  return (
    <>
      {readerId ? (
        <LikeButton
          liked={likedBy.includes(readerId)}
          what={what}
          onToggle={onToggle}
          className={className}
        />
      ) : null}
      {total > 0 ? (
        <button
          ref={count}
          type="button"
          onClick={() => {
            setOpen(true);
          }}
          aria-label={`${likesLabel(total)} on ${what}. Show who.`}
          data-target="small"
          className={cn(
            CONTROL,
            'font-semibold text-ink2 underline-offset-2 hover:underline',
            className,
          )}
        >
          {/* The mock's `.thumbmini`: the count's picture, not a control. */}
          <span
            aria-hidden="true"
            className="grid h-[1.3em] w-[1.3em] flex-none place-items-center rounded-full bg-action text-white"
          >
            <ThumbsUp className="h-[0.72em] w-[0.72em] fill-current" strokeWidth={0} />
          </span>
          {likesLabel(total)}
        </button>
      ) : null}
      {open ? (
        <LikesSheet
          memberIds={likedBy}
          linkState={linkState}
          onClose={() => {
            setOpen(false);
            count.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}

export function LikesSheet({
  memberIds,
  linkState,
  onClose,
}: {
  memberIds: readonly string[];
  linkState?: unknown;
  onClose: () => void;
}) {
  const authors = useChatAuthors([...memberIds]);
  const dialog = useRef<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const title = 'Who liked this';
  const known = memberIds.flatMap((id) => {
    const author = authors.get(id);
    return author ? [author] : [];
  });

  useDialogFocus(dialog, heading, onClose);

  return (
    <>
      {/* Out of the Tab order, as the viewer's backdrop is: it is there for a
          pointer, and a keyboard already has Close and Escape. */}
      <button
        type="button"
        aria-label="Close the list"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-[70] cursor-default bg-[rgba(10,20,35,.5)]"
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="likes-sheet-title"
        className={cn(
          'fixed z-[71] flex flex-col bg-paper',
          'inset-x-0 bottom-0 max-h-[80%] rounded-t-3xl shadow-[0_-14px_40px_rgba(10,20,35,.3)]',
          'lg:inset-x-auto lg:bottom-auto lg:top-1/2 lg:left-1/2 lg:max-h-[70%] lg:w-[420px]',
          'lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl',
          'lg:shadow-[0_24px_60px_rgba(10,20,35,.35)]',
        )}
      >
        {/* A phone affordance; noise on a panel. */}
        <div className="mx-auto mt-2.5 mb-1 h-[4.5px] w-[38px] flex-none rounded-[3px] bg-line lg:hidden" />

        <div className="flex-1 overflow-y-auto px-[18px] pt-1 lg:pt-5">
          <h2
            id="likes-sheet-title"
            ref={heading}
            tabIndex={-1}
            className="font-extrabold font-head text-[1.3125rem] text-ink tracking-[-0.01em] outline-none"
          >
            {title}
          </h2>
          <p className="mt-1 text-[0.84375rem] text-ink2 leading-[1.55]">
            Every member can see this list.
          </p>

          {known.length === 0 ? (
            <p role="status" className="py-4 text-[0.875rem] text-grey">
              Loading…
            </p>
          ) : (
            <ul className="mt-3 mb-2">
              {known.map((author) => (
                <li key={author.id} className="flex items-center gap-3 border-line border-t py-2.5">
                  {/* Decorative: the link to the profile is on the name. */}
                  <span aria-hidden="true" className="flex-none">
                    <MemberAvatar
                      id={author.id}
                      displayName={author.displayName}
                      photoPath={author.photoPath}
                      photoAlt={author.photoAlt}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-extrabold font-head text-[0.90625rem] text-ink">
                      {author.hasProfile ? (
                        <Link
                          to={`/peers/${author.id}`}
                          state={linkState}
                          className="underline-offset-2 hover:underline"
                        >
                          {author.displayName}
                        </Link>
                      ) : (
                        // Named, not linked: /peers/:id will not show them.
                        author.displayName
                      )}
                    </span>
                    {author.level ? (
                      <span className="block text-[0.78125rem] text-grey">{author.level}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-none border-line border-t px-[18px] pt-3 pb-6 lg:pb-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] flex-1 rounded-xl bg-tint px-5 font-bold font-head text-[0.9375rem] text-emphasis transition-colors hover:bg-line"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}
