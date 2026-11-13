import { Package } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSmallCopies } from '@/lib/chat/attachments';
import { formatPrice } from '@/lib/chat/listing-prices';
import { chatTime } from '@/lib/chat/time';
import type { ChatTopic } from '@/lib/chat/types';
import { getSupabase } from '@/lib/supabase';

/**
 * A Classifieds room's listings as pictures (the owner, 2026-11-12): in
 * classifieds the photograph is what people look at first. Each tile is the
 * first photograph on the listing's opening post, its title underneath, and
 * the price (For sale), where the seller is and when. Tapping it opens the
 * listing, which is the ordinary topic page: description, every photograph,
 * and the replies.
 *
 * A listing with no photograph (common in Looking for) gets a plain "No
 * photo" square, so the grid stays even. Replies are counted on the listing.
 */

/** The first photograph on each opening post, by post id. */
function useFirstPhotos(postIds: readonly string[]): Map<string, string> {
  const key = [...new Set(postIds)].sort().join(',');
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!key) return;
    let live = true;
    void getSupabase()
      .from('chat_posts')
      .select('id, attachments')
      .in('id', key.split(','))
      .then(({ data, error }) => {
        if (!live || error) return;
        const next = new Map<string, string>();
        for (const row of data as { id: string; attachments: string[] | null }[]) {
          const first = row.attachments?.[0];
          if (first) next.set(row.id, first);
        }
        setPhotos(next);
      });
    return () => {
      live = false;
    };
  }, [key]);
  return photos;
}

export function ListingGrid({
  topics,
  openingPosts,
  places,
  prices,
  free = false,
}: {
  topics: readonly ChatTopic[];
  /** Each topic's opening post id, from useTopicOpeningPosts. */
  openingPosts: Map<string, string | null>;
  /** Where each author is, by author id (author-places.ts). */
  places: Map<string, string>;
  /** Each listing's price in cents, by topic id; empty outside For sale. */
  prices: Map<string, number>;
  /** Giving away: every tile says Free where a price would be. */
  free?: boolean;
}) {
  const postIds = topics
    .map((topic) => openingPosts.get(topic.id))
    .filter((id): id is string => Boolean(id));
  const firstPhotos = useFirstPhotos(postIds);
  const { small } = useSmallCopies([...firstPhotos.values()]);

  return (
    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {topics.map((topic) => {
        const postId = openingPosts.get(topic.id);
        const path = postId ? firstPhotos.get(postId) : undefined;
        const src = path ? small.get(path) : undefined;
        const price = free ? 0 : prices.get(topic.id);
        const place = topic.authorId ? places.get(topic.authorId) : undefined;
        return (
          <li key={topic.id}>
            <Link
              to={`/chat/rooms/${topic.roomId}/topics/${topic.id}`}
              className="group block overflow-hidden rounded-[15px] border border-line bg-paper"
            >
              <span className="relative block aspect-square bg-tint">
                {src ? (
                  <img
                    src={src}
                    // The title is right below; the picture adds nothing a
                    // screen reader needs before it.
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : path ? null : (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-grey">
                    <Package aria-hidden="true" className="h-9 w-9" strokeWidth={1.5} />
                    <span className="text-[0.75rem]">No photo</span>
                  </span>
                )}
              </span>
              <span className="block px-2.5 pt-2 pb-2.5">
                {price !== undefined ? (
                  <span className="block font-extrabold font-head text-[0.9375rem] text-ink">
                    {formatPrice(price)}
                  </span>
                ) : null}
                <span className="line-clamp-2 font-bold font-head text-[0.84375rem] text-ink leading-[1.3] group-hover:underline">
                  {topic.unread ? <span className="sr-only">New. </span> : null}
                  {topic.title}
                </span>
                <span className="mt-1 block truncate text-[0.71875rem] text-grey">
                  {place ? `${place} · ` : null}
                  {chatTime(topic.createdAt)}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
