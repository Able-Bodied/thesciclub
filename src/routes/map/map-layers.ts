import {
  type AddLayerObject,
  type GeoJSONSource,
  MAP_FONT,
  type MapGeoJSONFeature,
  type MapLibreMap,
} from '@/lib/map';
import type { MapOrganization } from '@/lib/map-data';
import { type Box, LAYERS, type Layer } from '@/routes/map/places';

/**
 * The club's sources and layers on a MapLibre map: pins drawn by the GPU,
 * never a DOM element each. Colours are fixed in both themes; each pin has an
 * edge of at least 3:1 on the light and the dark basemap.
 */

export const NAVY = '#102a4c';
export const WHITE = '#ffffff';
const GOLD = '#d4a83a';
const PLUM = '#5b3d8f';

export const SOURCES: Record<Layer, string> = {
  events: 'club-events',
  peers: 'club-peers',
  organizations: 'club-organizations',
};
export const LAYER_IDS: Record<Layer, string[]> = {
  events: ['club-events-one', 'club-events-many', 'club-events-count'],
  peers: ['club-peers'],
  organizations: ['club-organizations'],
};
const FOCUS = 'club-organization-focus';
const PEER_ICON = 'club-peer';
const ORGANIZATION_ICON = 'club-organization';
/** The member's own city: a house, drawn on the map like the pins. */
const HOME = 'club-home';
const ICONS = [PEER_ICON, ORGANIZATION_ICON, HOME];

/** Badges drawn by path, not roundRect, which iOS 15's Safari lacks. */
function drawIcon(id: string): ImageData | null {
  const size = id === PEER_ICON ? 34 : id === HOME ? 28 : 30;
  const canvas = document.createElement('canvas');
  canvas.width = size * 2;
  canvas.height = size * 2;
  const pen = canvas.getContext('2d');
  if (!pen) return null;
  pen.scale(2, 2);
  pen.beginPath();
  if (id === HOME) {
    pen.arc(14, 14, 12.5, 0, Math.PI * 2);
    pen.lineWidth = 2.5;
    pen.fillStyle = WHITE;
    pen.strokeStyle = NAVY;
    pen.fill();
    pen.stroke();
    // Roof and walls, with the door left white.
    pen.beginPath();
    pen.moveTo(7, 14.5);
    pen.lineTo(14, 7.5);
    pen.lineTo(21, 14.5);
    pen.lineTo(19, 14.5);
    pen.lineTo(19, 20.5);
    pen.lineTo(15.5, 20.5);
    pen.lineTo(15.5, 16.5);
    pen.lineTo(12.5, 16.5);
    pen.lineTo(12.5, 20.5);
    pen.lineTo(9, 20.5);
    pen.lineTo(9, 14.5);
    pen.closePath();
    pen.fillStyle = NAVY;
    pen.fill();
    return pen.getImageData(0, 0, canvas.width, canvas.height);
  }
  if (id === PEER_ICON) {
    const [from, to, r] = [1.5, size - 1.5, 8];
    pen.moveTo(from + r, from);
    pen.arcTo(to, from, to, to, r);
    pen.arcTo(to, to, from, to, r);
    pen.arcTo(from, to, from, from, r);
    pen.arcTo(from, from, to, from, r);
    pen.closePath();
    pen.lineWidth = 2.5;
    pen.fillStyle = GOLD;
    pen.strokeStyle = NAVY;
  } else {
    const middle = size / 2;
    pen.moveTo(middle, 2);
    pen.lineTo(size - 2, middle);
    pen.lineTo(middle, size - 2);
    pen.lineTo(2, middle);
    pen.closePath();
    pen.lineWidth = 2.5;
    pen.fillStyle = PLUM;
    pen.strokeStyle = WHITE;
  }
  pen.fill();
  pen.stroke();
  return pen.getImageData(0, 0, canvas.width, canvas.height);
}

export function addIcon(map: MapLibreMap, id: string): void {
  if (!ICONS.includes(id) || map.hasImage(id)) return;
  const image = drawIcon(id);
  if (image) map.addImage(id, image, { pixelRatio: 2 });
}

const EMPTY = { type: 'FeatureCollection' as const, features: [] };

export function addLayers(map: MapLibreMap): void {
  for (const id of ICONS) addIcon(map, id);
  // A theme change brings a new sprite and can drop our badges.
  map.on('styleimagemissing', (event: { id: string }) => {
    addIcon(map, event.id);
  });
  for (const layer of LAYERS) {
    if (map.getSource(SOURCES[layer])) continue;
    map.addSource(SOURCES[layer], {
      type: 'geojson',
      data: EMPTY,
      cluster: true,
      clusterRadius: layer === 'events' ? 40 : 46,
      // Organizations' places are few: apart from city zoom on.
      clusterMaxZoom: layer === 'events' ? 14 : layer === 'peers' ? 11 : 9,
      // A cluster's count is its places' counts added up.
      clusterProperties: { count: ['+', ['get', 'count']] },
    });
  }
  if (!map.getSource(FOCUS)) map.addSource(FOCUS, { type: 'geojson', data: EMPTY });
  if (!map.getSource(HOME)) map.addSource(HOME, { type: 'geojson', data: EMPTY });
  const layers: AddLayerObject[] = [
    // Under every pin, so they stay tappable; just below the city's middle.
    {
      id: HOME,
      type: 'symbol',
      source: HOME,
      layout: {
        'icon-image': HOME,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: { 'icon-translate': [0, 18] },
    },
    // An open organization's other places: a white then navy circle round each.
    {
      id: `${FOCUS}-outer`,
      type: 'circle',
      source: FOCUS,
      paint: {
        'circle-radius': 25,
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': WHITE,
        'circle-stroke-width': 3,
        'circle-translate': [15, -15],
      },
    },
    {
      id: `${FOCUS}-inner`,
      type: 'circle',
      source: FOCUS,
      paint: {
        'circle-radius': 22,
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': NAVY,
        'circle-stroke-width': 3,
        'circle-translate': [15, -15],
      },
    },
    {
      id: 'club-organizations',
      type: 'symbol',
      source: SOURCES.organizations,
      layout: {
        'icon-image': ORGANIZATION_ICON,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'text-field': ['case', ['>', ['get', 'count'], 1], ['to-string', ['get', 'count']], ''],
        'text-font': [MAP_FONT],
        'text-size': 12,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      // Up and right of the point, so a city's events stay in view.
      paint: {
        'text-color': WHITE,
        'icon-translate': [15, -15],
        'text-translate': [15, -15],
      },
    },
    {
      id: 'club-peers',
      type: 'symbol',
      source: SOURCES.peers,
      layout: {
        'icon-image': PEER_ICON,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'text-field': ['to-string', ['get', 'count']],
        'text-font': [MAP_FONT],
        'text-size': 14,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      // Up and left, its corner at the city's middle.
      paint: { 'text-color': NAVY, 'icon-translate': [-17, -17], 'text-translate': [-17, -17] },
    },
    {
      id: 'club-events-one',
      type: 'circle',
      source: SOURCES.events,
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'count'], 1]],
      paint: {
        'circle-radius': 9,
        // One look, exact or not (the owner, 2026-10-26); the sheet says which.
        'circle-color': NAVY,
        'circle-stroke-color': WHITE,
        'circle-stroke-width': 2.5,
      },
    },
    {
      id: 'club-events-many',
      type: 'circle',
      source: SOURCES.events,
      filter: ['any', ['has', 'point_count'], ['>', ['get', 'count'], 1]],
      paint: {
        'circle-radius': ['step', ['get', 'count'], 14, 10, 17, 100, 20],
        'circle-color': NAVY,
        'circle-stroke-color': WHITE,
        'circle-stroke-width': 2.5,
      },
    },
    {
      id: 'club-events-count',
      type: 'symbol',
      source: SOURCES.events,
      filter: ['any', ['has', 'point_count'], ['>', ['get', 'count'], 1]],
      layout: {
        'text-field': ['to-string', ['get', 'count']],
        'text-font': [MAP_FONT],
        'text-size': 13,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: { 'text-color': WHITE },
    },
  ];
  for (const layer of layers) if (!map.getLayer(layer.id)) map.addLayer(layer);
}

/** Puts the house at the member's city, or takes it away. */
export function setHome(map: MapLibreMap, at: [number, number] | null): void {
  void map.getSource<GeoJSONSource>(HOME)?.setData({
    type: 'FeatureCollection',
    features: at
      ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: at }, properties: {} }]
      : [],
  });
}

/** The page's text size (Me → Display, and the iPhone's Text Size), as a multiple of 16px. */
export function pageTextScale(): number {
  const size = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? Math.min(Math.max(size / 16, 1), 3) : 1;
}

/** Counts and badges grow with the text, so a count still fits its pin. */
export function applyTextScale(map: MapLibreMap, scale: number): void {
  const at = (n: number) => n * scale;
  map.setLayoutProperty(HOME, 'icon-size', scale);
  map.setPaintProperty(HOME, 'icon-translate', [0, at(18)]);
  map.setLayoutProperty('club-organizations', 'text-size', at(12));
  map.setLayoutProperty('club-organizations', 'icon-size', scale);
  map.setPaintProperty('club-organizations', 'icon-translate', [at(15), at(-15)]);
  map.setPaintProperty('club-organizations', 'text-translate', [at(15), at(-15)]);
  map.setLayoutProperty('club-peers', 'text-size', at(14));
  map.setLayoutProperty('club-peers', 'icon-size', scale);
  map.setPaintProperty('club-peers', 'icon-translate', [at(-17), at(-17)]);
  map.setPaintProperty('club-peers', 'text-translate', [at(-17), at(-17)]);
  map.setLayoutProperty('club-events-count', 'text-size', at(13));
  map.setPaintProperty('club-events-one', 'circle-radius', at(9));
  map.setPaintProperty('club-events-many', 'circle-radius', [
    'step',
    ['get', 'count'],
    at(14),
    10,
    at(17),
    100,
    at(20),
  ]);
  for (const [id, r] of [
    [`${FOCUS}-outer`, 25],
    [`${FOCUS}-inner`, 22],
  ] as const) {
    map.setPaintProperty(id, 'circle-radius', at(r));
    map.setPaintProperty(id, 'circle-translate', [at(15), at(-15)]);
  }
}

const DIM = 0.3;

/**
 * While an organization's sheet is open: its other places ringed, every other
 * pin faded. Shape and fading, not colour alone. Null clears it.
 */
export function applyFocus(
  map: MapLibreMap,
  focus: { organizationIds: string[]; rings: MapOrganization[] } | null,
): void {
  void map.getSource<GeoJSONSource>(FOCUS)?.setData({
    type: 'FeatureCollection',
    features: (focus?.rings ?? []).map((place) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [place.longitude, place.latitude] },
      properties: {},
    })),
  });
  const faded = focus ? DIM : 1;
  for (const id of LAYER_IDS.events) {
    if (id === 'club-events-count') map.setPaintProperty(id, 'text-opacity', faded);
    else {
      map.setPaintProperty(id, 'circle-opacity', faded);
      map.setPaintProperty(id, 'circle-stroke-opacity', faded);
    }
  }
  map.setPaintProperty('club-peers', 'icon-opacity', faded);
  map.setPaintProperty('club-peers', 'text-opacity', faded);
  // Typed loosely: MapLibre's expression types do not follow a spread.
  const theirs = (
    focus
      ? [
          'case',
          [
            'any',
            ...focus.organizationIds.map((id) => [
              'in',
              `,${id},`,
              ['coalesce', ['get', 'orgs'], ''],
            ]),
          ],
          1,
          DIM,
        ]
      : 1
  ) as never;
  map.setPaintProperty('club-organizations', 'icon-opacity', theirs);
  map.setPaintProperty('club-organizations', 'text-opacity', theirs);
}

/** The places under a tap, clusters opened up. */
export interface Picked {
  keys: Record<Layer, Set<string>>;
  /** A cluster's middle and the zoom that splits it. */
  zoomTo: { center: [number, number]; zoom: number } | null;
}

export async function pick(
  map: MapLibreMap,
  hits: MapGeoJSONFeature[],
  tapped: [number, number],
): Promise<Picked> {
  const keys: Record<Layer, Set<string>> = {
    events: new Set(),
    peers: new Set(),
    organizations: new Set(),
  };
  let zoomTo: Picked['zoomTo'] = null;
  for (const hit of hits) {
    const layer = LAYERS.find((name) => SOURCES[name] === hit.source);
    if (!layer) continue;
    const properties = hit.properties as {
      key?: string;
      cluster_id?: number;
      point_count?: number;
    };
    if (typeof properties.cluster_id !== 'number') {
      if (properties.key) keys[layer].add(properties.key);
      continue;
    }
    const source = map.getSource<GeoJSONSource>(SOURCES[layer]);
    if (!source) continue;
    const leaves: unknown[] = await source.getClusterLeaves(
      properties.cluster_id,
      properties.point_count ?? 1000,
      0,
    );
    for (const leaf of leaves) {
      const key = (leaf as { properties?: { key?: unknown } | null }).properties?.key;
      if (typeof key === 'string') keys[layer].add(key);
    }
    if (!zoomTo) {
      const zoom = await source.getClusterExpansionZoom(properties.cluster_id);
      zoomTo = { center: tapped, zoom };
    }
  }
  return { keys, zoomTo };
}

export const boxOf = (map: MapLibreMap): Box => {
  const bounds = map.getBounds();
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
};
