import { usePhotoUrl } from '@/lib/photos';
import { cn } from '@/lib/utils';

/**
 * An event's cover picture (20261011070000): large at the top of its page,
 * small on its card.
 *
 * On the page it is drawn whole, never cropped: a cover is often a flyer, and
 * a flyer cut off at the edges has lost the words it was for. On the card it
 * is a small square, cropped, because there it only says "this one has a
 * picture" beside a title that already says what it is.
 *
 * The alt is what was given when it was added, and empty otherwise: a flyer's
 * words are usually the event's own, which the page already reads out.
 * Nothing is drawn while the signed URL is being made, rather than a box that
 * would jump when the picture lands.
 */
export function EventCover({
  path,
  alt,
  size,
  className,
}: {
  path: string | null;
  alt: string | null;
  size: 'page' | 'card';
  className?: string;
}) {
  const url = usePhotoUrl(path);
  if (!url) return null;
  if (size === 'card') {
    return (
      <img
        src={url}
        alt={alt ?? ''}
        loading="lazy"
        className={cn('h-[4.5rem] w-[4.5rem] flex-none rounded-[12px] object-cover', className)}
      />
    );
  }
  return (
    <img
      src={url}
      alt={alt ?? ''}
      className={cn('block max-h-[60vh] w-full rounded-[14px] bg-plate object-contain', className)}
    />
  );
}
