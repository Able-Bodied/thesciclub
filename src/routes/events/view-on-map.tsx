import { MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { preloadMap } from '@/routes/map/view-switch';

/**
 * "View on the map": a link, not a button, as it goes somewhere. It loads
 * nothing of the map itself; a hover or focus may start its script early.
 * Wide screens only (the owner, 2026-10-31): on a phone the map's sheet leaves
 * too little of it to use.
 */
export function ViewOnMap({
  title,
  to,
  className,
}: {
  title: string;
  to: string;
  className?: string;
}) {
  return (
    <Link
      to={to}
      aria-label={`View ${title} on the map`}
      onPointerEnter={preloadMap}
      onFocus={preloadMap}
      className={cn(
        'hidden min-h-11 items-center gap-1.5 rounded-[13px] border-[1.6px] border-line px-3.5 font-bold font-head text-[0.875rem] text-emphasis transition-colors hover:bg-tint lg:inline-flex',
        className,
      )}
    >
      <MapPin aria-hidden="true" className="h-4 w-4 flex-none" />
      View on the map
    </Link>
  );
}
