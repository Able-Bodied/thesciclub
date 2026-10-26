import { Component, lazy, type ReactNode, Suspense, useEffect, useRef, useState } from 'react';
import { useMapData } from '@/lib/map-data';
import type { ClubMapProps } from '@/routes/map/club-map';
import { loadClubMap } from '@/routes/map/view-switch';

/**
 * The Map view of Events and Peers. Mounted the first time Map is chosen and
 * kept, hidden, after (the List view is untouched), so going back to the map
 * finds it where it was. Its data is read only while shown (useMapData), beside
 * the map's script; the map waits for both, so it never opens in one place and
 * jumps to "you".
 */

/** Why the list stands in for the map. */
export type MapProblem = { kind: 'unsupported' } | { kind: 'error'; retry: () => void };

export interface MapViewProps extends Omit<ClubMapProps, 'contents' | 'onUnsupported' | 'hidden'> {
  hidden: boolean;
  onProblem: (problem: MapProblem | null) => void;
}

export function MapView({ hidden, onProblem, ...map }: MapViewProps) {
  const data = useMapData(!hidden);
  const report = useRef(onProblem);
  report.current = onProblem;
  const retry = useRef(data.retry);
  retry.current = data.retry;
  const { status } = data;
  // A new lazy screen on "Try the map again": React keeps a failed one failed.
  const [ClubMap, setClubMap] = useState(() => lazy(loadClubMap));

  useEffect(() => {
    if (status === 'error') {
      report.current({
        kind: 'error',
        retry: () => {
          report.current(null);
          retry.current();
        },
      });
    }
  }, [status]);

  return (
    <div hidden={hidden} className="relative min-h-0 flex-1">
      {status === 'ready' ? (
        <MapFailed
          onRetry={() => {
            setClubMap(() => lazy(loadClubMap));
          }}
        >
          <Suspense fallback={<MapPlaceholder />}>
            <ClubMap
              {...map}
              contents={data.contents}
              hidden={hidden}
              onUnsupported={() => {
                report.current({ kind: 'unsupported' });
              }}
            />
          </Suspense>
        </MapFailed>
      ) : (
        <MapPlaceholder />
      )}
    </div>
  );
}

/** The map's script or MapLibre failed to load (offline, a deploy moved on): say so, offer again. */
class MapFailed extends Component<
  { children: ReactNode; onRetry: () => void },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        className="absolute inset-0 grid place-content-center gap-3 bg-tint px-6 text-center text-[0.875rem] text-ink2"
      >
        <p>The map didn’t load. Check the connection, then try again.</p>
        <button
          type="button"
          onClick={() => {
            this.props.onRetry();
            this.setState({ failed: false });
          }}
          className="mx-auto min-h-[44px] rounded-full bg-action px-5 font-bold text-white hover:bg-action-hi"
        >
          Try the map again
        </button>
      </div>
    );
  }
}

/** The map's own size, so nothing moves when it arrives. */
export function MapPlaceholder() {
  return (
    <div
      role="status"
      className="absolute inset-0 grid place-items-center bg-tint text-[0.875rem] text-ink2"
    >
      Loading the map…
    </div>
  );
}

/** Above the list, when the map cannot be shown. */
export function MapProblemNote({ problem }: { problem: MapProblem }) {
  return (
    <p
      role="status"
      className="mb-3 rounded-r-[11px] border-gold border-l-[3px] bg-gold-lt px-3.5 py-3 text-[0.8125rem] text-gold-ink leading-[1.5]"
    >
      {problem.kind === 'unsupported'
        ? 'This device can’t draw the map, so here is the list instead.'
        : 'The map didn’t load, so here is the list. '}
      {problem.kind === 'error' ? (
        <button
          type="button"
          onClick={problem.retry}
          className="min-h-[44px] font-bold underline underline-offset-2"
        >
          Try the map again
        </button>
      ) : null}
    </p>
  );
}
