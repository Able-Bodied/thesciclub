import { List, Map as MapIcon } from 'lucide-react';
import { useCallback } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { loadMapCanvas } from '@/lib/map';
import { cn } from '@/lib/utils';
import type * as ClubMapModule from '@/routes/map/club-map';

/**
 * List or Map, at the top of Events and Peers (the owner, 2026-10-25). In the
 * address as `?view=map`, replaced rather than pushed, as the segment is, so a
 * refresh or a back from a detail page comes back to the map.
 */
export type ListOrMap = 'list' | 'map';

/**
 * Only on the screen's own path: Events and Peers both stay mounted (KeptTabs),
 * and the hidden one must not open a map for the other's `?view=map`.
 */
export function useListOrMap(path: string): [ListOrMap, (next: ListOrMap) => void] {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const here = pathname === path || pathname === `${path}/`;
  const view: ListOrMap = here && params.get('view') === 'map' ? 'map' : 'list';
  const setView = useCallback(
    (next: ListOrMap) => {
      setParams(
        (current) => {
          if (next === 'map') current.set('view', 'map');
          else current.delete('view');
          return current;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return [view, setView];
}

let clubMap: Promise<typeof ClubMapModule> | undefined;

/**
 * One read shared by the preload and the lazy screens; a failed one is asked
 * again. Each caller gets a promise of its own: React marks one it has seen as
 * settled, and a second screen's lazy handed that same promise replayed forever.
 */
export function loadClubMap(): Promise<typeof ClubMapModule> {
  clubMap ??= import('@/routes/map/club-map').catch((error: unknown) => {
    clubMap = undefined;
    throw error;
  });
  return clubMap.then((module) => module);
}

/** The map's screen and MapLibre together, so neither waits for the other. */
export function preloadMap(): void {
  void loadClubMap().catch(() => undefined);
  void loadMapCanvas().catch(() => undefined);
}

export function ViewSwitch({
  view,
  onChange,
}: {
  view: ListOrMap;
  onChange: (next: ListOrMap) => void;
}) {
  const option = (value: ListOrMap, label: string, Icon: typeof List) => (
    <button
      type="button"
      aria-pressed={view === value}
      onClick={() => {
        onChange(value);
      }}
      {...(value === 'map' ? { onPointerEnter: preloadMap, onFocus: preloadMap } : {})}
      className={cn(
        'flex min-h-[44px] items-center gap-1.5 rounded-full px-3.5 font-semibold text-[0.84375rem] transition-colors',
        view === value ? 'bg-action text-white hover:bg-action-hi' : 'text-ink2 hover:bg-line',
      )}
    >
      <Icon aria-hidden="true" className="h-[16px] w-[16px]" strokeWidth={2.2} />
      {label}
    </button>
  );
  return (
    <fieldset className="flex flex-none rounded-full bg-tint p-0.5">
      <legend className="sr-only">Show as</legend>
      {option('list', 'List', List)}
      {option('map', 'Map', MapIcon)}
    </fieldset>
  );
}
