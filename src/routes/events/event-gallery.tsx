import { useState } from 'react';
import { useAttachmentUrls } from '@/lib/chat/attachments';
import type { EventPhoto } from '@/lib/events';
import { PHOTOS_BUCKET } from '@/lib/photos';
import { cn } from '@/lib/utils';
import { EventCover } from '@/routes/events/event-cover';

/**
 * An event's pictures (the owner, 2026-10-31; 20261031060000): one large, and
 * the rest in a row under it. Pressing one in the row shows it large. With one
 * picture there is no row, so an event looks as it always did.
 */
export function EventGallery({
  path,
  alt,
  more = [],
  className,
}: {
  path: string | null;
  alt: string | null;
  more?: readonly EventPhoto[] | undefined;
  className?: string | undefined;
}) {
  const pictures: EventPhoto[] = [...(path ? [{ path, alt: alt ?? '' }] : []), ...more];
  const [chosen, setChosen] = useState(0);
  const urls = useAttachmentUrls(
    pictures.map((picture) => picture.path),
    PHOTOS_BUCKET,
  );

  const shown = pictures[Math.min(chosen, pictures.length - 1)];
  if (!shown) return null;
  if (pictures.length === 1) {
    return <EventCover path={shown.path} alt={shown.alt} size="page" className={className} />;
  }

  return (
    <div className={className}>
      <EventCover path={shown.path} alt={shown.alt} size="page" />
      <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {pictures.map((picture, index) => {
          const on = picture === shown;
          const url = urls.get(picture.path);
          return (
            <li key={picture.path} className="flex-none">
              <button
                type="button"
                aria-pressed={on}
                aria-label={`Show picture ${index + 1} of ${pictures.length}${
                  picture.alt ? `: ${picture.alt}` : ''
                }`}
                onClick={() => {
                  setChosen(index);
                }}
                className={cn(
                  'block h-14 w-14 overflow-hidden rounded-[10px] bg-tint',
                  on ? 'ring-2 ring-gold ring-offset-1' : 'opacity-75',
                )}
              >
                {url ? (
                  <img
                    src={url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
