import { MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { preloadMap } from '@/routes/map/view-switch';

/**
 * "View on the map": a link, not a button, as it goes somewhere. It loads
 * nothing of the map itself; a hover or focus may start its script early.
 */
export function ViewOnMap({
  title,
  to,
  tone = 'card',
  className,
}: {
  title: string;
  to: string;
  /** `plate` on the event page's navy band. */
  tone?: 'card' | 'plate';
  className?: string;
}) {
  return (
    <Link
      to={to}
      aria-label={`View ${title} on the map`}
      onPointerEnter={preloadMap}
      onFocus={preloadMap}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-[13px] px-3.5 font-bold font-head text-[0.875rem] transition-colors',
        tone === 'plate'
          ? 'border-[1.6px] border-white/60 text-white hover:bg-plate-hover'
          : 'border-[1.6px] border-line text-emphasis hover:bg-tint',
        className,
      )}
    >
      <MapPin aria-hidden="true" className="h-4 w-4 flex-none" />
      View on the map
    </Link>
  );
}
