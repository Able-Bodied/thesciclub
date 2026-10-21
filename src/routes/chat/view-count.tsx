import { useContext, useState } from 'react';
import { AccountContext } from '@/lib/account-context';
import { PostViewersSheet } from '@/routes/chat/post-viewers-sheet';

/**
 * Missing counts are loading or unavailable, never invented zeroes.
 *
 * For an administrator the count opens who viewed the post (2026-10-20).
 * Admin status comes from the club's one account read, never a read of its
 * own, so a card outside the club (or in a test) simply shows the count.
 */
export function ViewCount({
  count,
  postId,
}: {
  count: number | null | undefined;
  postId?: string | undefined;
}) {
  const isAdmin = useContext(AccountContext)?.isAdmin ?? false;
  const [open, setOpen] = useState(false);
  const text =
    count === undefined
      ? 'Views …'
      : count === null
        ? 'Views unavailable'
        : `${count} ${count === 1 ? 'view' : 'views'}`;

  if (!isAdmin || !postId || typeof count !== 'number') {
    return <span className="font-semibold text-[0.78125rem] text-ink2">{text}</span>;
  }
  return (
    <>
      {/* Above a card's stretched link, so it opens the list, not the post. */}
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        aria-haspopup="dialog"
        data-target="small"
        className="relative z-[1] font-semibold text-[0.78125rem] text-ink2 underline underline-offset-2"
      >
        {text}
        <span className="sr-only">, see who viewed</span>
      </button>
      {open ? (
        <PostViewersSheet
          postId={postId}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
