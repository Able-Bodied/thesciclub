import 'maplibre-gl/dist/maplibre-gl.css';
import { Minus, Plus } from 'lucide-react';
import { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motionReduced } from '@/lib/accessibility';
import { cn } from '@/lib/utils';
import { warmMap } from './archives';
import { basemapStyle, glyphRequest, keepCallerLayers } from './style';
import { CALIFORNIA } from './tiles';

export { warmMap };

/** A DOM marker, for the few things that are not pins: "you", say. Not tappable. */
export interface MapMarker {
  id: string;
  /** [longitude, latitude]. */
  at: [number, number];
  /** Which part of it sits on `at`, and how far off in pixels; centred by default. */
  anchor?: 'center' | 'top';
  offset?: [number, number];
  children: ReactNode;
}

export interface MapCanvasProps {
  /** Where it opens, [longitude, latitude]; without it, California. Read once. */
  center?: [number, number];
  /** Read once, with `center`. */
  zoom?: number;
  /** The map's name for a screen reader. */
  label?: string;
  /** The map, once its style is in, for the caller's sources and layers. */
  /** Null when that map is removed (a kept tab hidden, or unmounted): it must not be used again. */
  onReady?: (map: MapLibreMap | null) => void;
  /** No WebGL2: nothing is drawn, and the caller shows something else. */
  onUnsupported?: () => void;
  /** Buttons above the zoom buttons, such as "near me". */
  controls?: ReactNode;
  markers?: MapMarker[];
  className?: string;
}

/** Whether the page is dark now (index.css decides; this reads its result). */
function pageIsDark(): boolean {
  return getComputedStyle(document.documentElement).colorScheme.includes('dark');
}

function usePageDark(): boolean {
  const [dark, setDark] = useState(pageIsDark);
  useEffect(() => {
    const update = () => {
      setDark(pageIsDark());
    };
    // Shown again after a hidden spell: the theme may have changed meanwhile.
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-appearance', 'data-force-light'],
    });
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', update);
    return () => {
      observer.disconnect();
      query.removeEventListener('change', update);
    };
  }, []);
  return dark;
}

const BUTTON =
  'grid h-11 w-11 place-items-center bg-paper text-ink transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-tint';

/**
 * A full-screen map: pan and zoom only, no tilt or turn. Load it lazily
 * (loadMapCanvas in ./index.ts), as it carries MapLibre.
 */
export default function MapCanvas({
  center,
  zoom,
  label = 'Map',
  onReady,
  onUnsupported,
  controls,
  markers = [],
  className,
}: MapCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const dark = usePageDark();
  const callbacks = useRef({ onReady, onUnsupported });
  callbacks.current = { onReady, onUnsupported };
  const initial = useRef({ center, zoom, label });
  const shownDark = useRef(dark);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let created: MapLibreMap;
    // The theme now, not when first drawn: it may have changed while hidden.
    const dark = pageIsDark();
    shownDark.current = dark;
    try {
      created = new MapLibreMap({
        container: element,
        style: basemapStyle(dark),
        ...(initial.current.center
          ? { center: initial.current.center, zoom: initial.current.zoom ?? 10 }
          : { bounds: CALIFORNIA, fitBoundsOptions: { padding: 16 } }),
        minZoom: 2,
        maxZoom: 18,
        maxPitch: 0,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        rollEnabled: false,
        renderWorldCopies: false,
        attributionControl: false,
        validateStyle: false,
        reduceMotion: motionReduced(),
        fadeDuration: motionReduced() ? 0 : 300,
        transformRequest: glyphRequest,
        // The canvas is the region a screen reader names.
        locale: { 'Map.Title': initial.current.label },
      });
    } catch {
      // MapLibre 6 needs WebGL2 and throws without it.
      callbacks.current.onUnsupported?.();
      return;
    }
    created.touchZoomRotate.disableRotation();
    created.keyboard.disableRotation();
    created.once('style.load', () => {
      callbacks.current.onReady?.(created);
    });
    setMap(created);
    return () => {
      // Hidden and shown again (a kept tab), it opens where it was left.
      const { lng, lat } = created.getCenter();
      initial.current = { ...initial.current, center: [lng, lat], zoom: created.getZoom() };
      setMap(null);
      callbacks.current.onReady?.(null);
      created.remove();
    };
  }, []);

  useEffect(() => {
    if (!map || shownDark.current === dark) return;
    shownDark.current = dark;
    map.setStyle(basemapStyle(dark), { diff: true, transformStyle: keepCallerLayers });
  }, [map, dark]);

  const zoomBy = (step: number) => {
    if (!map) return;
    map.easeTo({ zoom: map.getZoom() + step });
  };

  return (
    <div className={cn('relative h-full w-full', className)}>
      {/* Sized, not inset: MapLibre's stylesheet makes it position: relative. */}
      <div ref={container} className="h-full w-full" />
      {map
        ? markers.map((marker) => (
            <DomMarker
              key={marker.id}
              map={map}
              at={marker.at}
              anchor={marker.anchor ?? 'center'}
              offset={marker.offset ?? [0, 0]}
            >
              {marker.children}
            </DomMarker>
          ))
        : null}
      <div className="absolute right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col items-end gap-2">
        {controls}
        <div className="flex flex-col divide-y divide-line rounded-xl border border-line shadow-sm">
          <button
            type="button"
            aria-label="Zoom in"
            className={BUTTON}
            onClick={() => {
              zoomBy(1);
            }}
          >
            <Plus aria-hidden className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            className={BUTTON}
            onClick={() => {
              zoomBy(-1);
            }}
          >
            <Minus aria-hidden className="h-5 w-5" />
          </button>
        </div>
      </div>
      {/* OpenStreetMap's licence (ODbL) asks for this wherever the map shows. */}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-[max(0.25rem,env(safe-area-inset-bottom))] left-1 rounded bg-paper/80 px-1.5 py-0.5 text-[0.75rem] text-ink2 underline-offset-2 hover:underline"
      >
        © OpenStreetMap
      </a>
    </div>
  );
}

function DomMarker({
  map,
  at,
  anchor,
  offset,
  children,
}: {
  map: MapLibreMap;
  at: [number, number];
  anchor: 'center' | 'top';
  offset: [number, number];
  children: ReactNode;
}) {
  const [element] = useState(() => {
    const div = document.createElement('div');
    div.style.pointerEvents = 'none';
    return div;
  });
  const marker = useRef<Marker | null>(null);
  const [lng, lat] = at;
  // biome-ignore lint/correctness/useExhaustiveDependencies: moved by the effect below, not made again.
  useEffect(() => {
    const made = new Marker({ element, anchor, offset }).setLngLat([lng, lat]).addTo(map);
    marker.current = made;
    return () => {
      made.remove();
      marker.current = null;
    };
  }, [map, element]);
  useEffect(() => {
    marker.current?.setLngLat([lng, lat]);
  }, [lng, lat]);
  return createPortal(children, element);
}
