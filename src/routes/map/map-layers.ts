import {
  type AddLayerObject,
  type GeoJSONSource,
  MAP_FONT,
  type MapGeoJSONFeature,
  type MapLibreMap,
} from '@/lib/map';
import type { MapOrganization } from '@/lib/map-data';
import {
  addBadge,
  BADGE_PREFIX,
  BADGE_SIZE,
  isBadge,
  PLUM,
  setBadgeScale,
} from '@/routes/map/organization-badges';
import { addPhotoBox, isPhotoBox, PHOTO_PREFIX } from '@/routes/map/peer-photos';
import { type Box, LAYERS, type Layer } from '@/routes/map/places';

/**
 * The club's sources and layers on a MapLibre map: pins drawn by the GPU,
 * never a DOM element each. Colours are fixed in both themes; each pin has an
 * edge of at least 3:1 on the light and the dark basemap.
 */

export const NAVY = '#102a4c';
export const WHITE = '#ffffff';
const GOLD = '#d4a83a';

export const SOURCES: Record<Layer, string> = {
  events: 'club-events',
  peers: 'club-peers',
  organizations: 'club-organizations',
};
export const LAYER_IDS: Record<Layer, string[]> = {
  events: ['club-events-one', 'club-events-many', 'club-events-count'],
  peers: ['club-peers', 'club-peers-name'],
  organizations: ['club-organizations', 'club-organizations-count', 'club-organizations-name'],
};
const FOCUS = 'club-organization-focus';
/** The zoom from which organizations' places are drawn one by one. */
const ORGANIZATIONS_APART_FROM = 10;
const PEER_ICON = 'club-peer';
/** Several organizations' places run together, before they split. */
const ORGANIZATION_ICON = 'club-organization';
/** How many organizations share one point, on the first one's badge. */
const COUNT_CHIP = 'club-organization-chip';
/** The member's own city: a house, drawn on the map like the pins. */
const HOME = 'club-home';
const ICONS = [PEER_ICON, ORGANIZATION_ICON, COUNT_CHIP, HOME];

const CHIP_SIZE = 19;
/** The chip sits on the badge's upper right. */
const CHIP_AT = 26;

/**
 * How much bigger than drawn every place's mark shows (the owner,
 * 2026-10-28): logos and photographs were too small to make out, and every
 * kind of mark is one size. Text-size scaling goes
 * on top. Badges are drawn this much sharper too (setBadgeScale).
 */
export const ICON_GROW = 1.35;
/** Pixels drawn for each one shown, so a grown mark stays sharp on a 3x screen. */
const ICON_RATIO = 4;
/** An event's dot, as wide as an organization's badge (BADGE_SIZE 32). */
const EVENT_DOT = 16;

/** Badges drawn by path, not roundRect, which iOS 15's Safari lacks. */
function drawIcon(id: string): ImageData | null {
  const size =
    id === PEER_ICON ? 34 : id === HOME ? 28 : id === COUNT_CHIP ? CHIP_SIZE : BADGE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size * ICON_RATIO;
  canvas.height = size * ICON_RATIO;
  const pen = canvas.getContext('2d');
  if (!pen) return null;
  pen.scale(ICON_RATIO, ICON_RATIO);
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
    // Purple in a white edge, the size of a badge or its chip.
    const middle = size / 2;
    pen.arc(middle, middle, middle, 0, Math.PI * 2);
    pen.fillStyle = WHITE;
    pen.fill();
    pen.beginPath();
    pen.arc(middle, middle, middle - 1.25, 0, Math.PI * 2);
    pen.fillStyle = PLUM;
    pen.fill();
    return pen.getImageData(0, 0, canvas.width, canvas.height);
  }
  pen.fill();
  pen.stroke();
  return pen.getImageData(0, 0, canvas.width, canvas.height);
}

export function addIcon(map: MapLibreMap, id: string): void {
  if (!ICONS.includes(id) || map.hasImage(id)) return;
  const image = drawIcon(id);
  if (image) map.addImage(id, image, { pixelRatio: ICON_RATIO });
}

const EMPTY = { type: 'FeatureCollection' as const, features: [] };

export function addLayers(map: MapLibreMap): void {
  for (const id of ICONS) addIcon(map, id);
  // A theme change can drop our badges, and logos are drawn when first
  // needed. MapLibre 6 asks this, not a styleimagemissing listener, which comes too late.
  map.setMissingStyleImageResolver((id) => {
    if (isBadge(id)) addBadge(map, id);
    else if (isPhotoBox(id)) addPhotoBox(map, id);
    else addIcon(map, id);
  });
  for (const layer of LAYERS) {
    if (map.getSource(SOURCES[layer])) continue;
    map.addSource(SOURCES[layer], {
      type: 'geojson',
      data: EMPTY,
      cluster: true,
      // The marks are grown (ICON_GROW): more room apart.
      clusterRadius: 54,
      // Organizations' places are few: apart from city zoom on.
      clusterMaxZoom:
        layer === 'events' ? 14 : layer === 'peers' ? 11 : ORGANIZATIONS_APART_FROM - 1,
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
    // An open organization's other places: a white then navy circle round each
    // badge, only once places are no longer folded into clusters.
    {
      id: `${FOCUS}-outer`,
      type: 'circle',
      source: FOCUS,
      minzoom: ORGANIZATIONS_APART_FROM,
      paint: {
        'circle-radius': 22,
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
      minzoom: ORGANIZATIONS_APART_FROM,
      paint: {
        'circle-radius': 19,
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
        // Its own logo, fetched only once MapLibre asks (organization-badges.ts).
        'icon-image': [
          'case',
          ['has', 'point_count'],
          ORGANIZATION_ICON,
          ['concat', BADGE_PREFIX, ['get', 'organizationId']],
        ],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'text-field': ['case', ['has', 'point_count'], ['to-string', ['get', 'count']], ''],
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
      id: 'club-organizations-count',
      type: 'symbol',
      source: SOURCES.organizations,
      filter: ['all', ['!', ['has', 'point_count']], ['>', ['get', 'count'], 1]],
      layout: {
        'icon-image': COUNT_CHIP,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'text-field': ['to-string', ['get', 'count']],
        'text-font': [MAP_FONT],
        'text-size': 11,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': WHITE,
        'icon-translate': [CHIP_AT, -CHIP_AT],
        'text-translate': [CHIP_AT, -CHIP_AT],
      },
    },
    // A name under each mark (the owner, 2026-10-28): a city's one member,
    // an organization's. Dropped where it would run into another.
    {
      id: 'club-organizations-name',
      type: 'symbol',
      source: SOURCES.organizations,
      filter: ['all', ['!', ['has', 'point_count']], ['has', 'label']],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': [MAP_FONT],
        'text-size': 11,
        'text-anchor': 'top',
        'text-max-width': 9,
      },
      paint: {
        'text-color': NAVY,
        // A soft glow, not an outline (the owner, 2026-10-28): enough to read
        // on the dark basemap without the letters looking bold.
        'text-halo-color': 'rgba(255,255,255,0.85)',
        'text-halo-width': 1,
        'text-halo-blur': 1,
        'text-translate': [15, 4],
      },
    },
    {
      id: 'club-peers-name',
      type: 'symbol',
      source: SOURCES.peers,
      filter: ['all', ['!', ['has', 'point_count']], ['has', 'label']],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': [MAP_FONT],
        'text-size': 11,
        'text-anchor': 'top',
        'text-max-width': 9,
      },
      paint: {
        'text-color': NAVY,
        // A soft glow, not an outline (the owner, 2026-10-28): enough to read
        // on the dark basemap without the letters looking bold.
        'text-halo-color': 'rgba(255,255,255,0.85)',
        'text-halo-width': 1,
        'text-halo-blur': 1,
        'text-translate': [-17, 3],
      },
    },
    {
      id: 'club-peers',
      type: 'symbol',
      source: SOURCES.peers,
      layout: {
        // One member with a photograph: it, in the box (peer-photos.ts).
        'icon-image': [
          'case',
          ['all', ['!', ['has', 'point_count']], ['has', 'photo']],
          ['concat', PHOTO_PREFIX, ['get', 'photo']],
          PEER_ICON,
        ],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'text-field': [
          'case',
          ['all', ['!', ['has', 'point_count']], ['has', 'photo']],
          '',
          ['to-string', ['get', 'count']],
        ],
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
  // Every place's mark, and where it sits off its point, grows; Home does not.
  const mark = scale * ICON_GROW;
  const off = (n: number) => n * mark;
  setBadgeScale(mark);
  map.setLayoutProperty(HOME, 'icon-size', scale);
  map.setPaintProperty(HOME, 'icon-translate', [0, at(18)]);
  map.setLayoutProperty('club-organizations', 'text-size', off(12));
  map.setLayoutProperty('club-organizations', 'icon-size', mark);
  map.setPaintProperty('club-organizations', 'icon-translate', [off(15), off(-15)]);
  map.setPaintProperty('club-organizations', 'text-translate', [off(15), off(-15)]);
  map.setLayoutProperty('club-organizations-count', 'text-size', off(11));
  map.setLayoutProperty('club-organizations-count', 'icon-size', mark);
  map.setPaintProperty('club-organizations-count', 'icon-translate', [off(CHIP_AT), off(-CHIP_AT)]);
  map.setPaintProperty('club-organizations-count', 'text-translate', [off(CHIP_AT), off(-CHIP_AT)]);
  map.setLayoutProperty('club-peers', 'text-size', off(14));
  for (const [id, x, y] of [
    ['club-peers-name', -17, 3],
    ['club-organizations-name', 15, 4],
  ] as const) {
    map.setLayoutProperty(id, 'text-size', at(11) * ICON_GROW ** 0.5);
    map.setPaintProperty(id, 'text-translate', [off(x), off(y)]);
  }
  map.setLayoutProperty('club-peers', 'icon-size', mark);
  map.setPaintProperty('club-peers', 'icon-translate', [off(-17), off(-17)]);
  map.setPaintProperty('club-peers', 'text-translate', [off(-17), off(-17)]);
  // Events' dots as big as the other marks (the owner, 2026-10-28): every
  // place on the map one size, a bubble of many a little bigger.
  map.setLayoutProperty('club-events-count', 'text-size', off(13));
  map.setPaintProperty('club-events-one', 'circle-radius', off(EVENT_DOT));
  map.setPaintProperty('club-events-many', 'circle-radius', [
    'step',
    ['get', 'count'],
    off(EVENT_DOT),
    10,
    off(EVENT_DOT + 2),
    100,
    off(EVENT_DOT + 4),
  ]);
  for (const [id, r] of [
    [`${FOCUS}-outer`, 22],
    [`${FOCUS}-inner`, 19],
  ] as const) {
    map.setPaintProperty(id, 'circle-radius', off(r));
    map.setPaintProperty(id, 'circle-translate', [off(15), off(-15)]);
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
  for (const id of LAYER_IDS.organizations) {
    map.setPaintProperty(id, 'icon-opacity', theirs);
    map.setPaintProperty(id, 'text-opacity', theirs);
  }
}

/** The places under a tap, clusters opened up. */
export interface Picked {
  keys: Record<Layer, Set<string>>;
  /** A cluster's middle and the zoom that splits it. */
  zoomTo: { center: [number, number]; zoom: number } | null;
  /**
   * West-south and east-north of every place under the tap, when a cluster
   * is among them and they are not all at one point (the owner,
   * 2026-10-28): a tap zooms to fit them, so they come apart.
   */
  spread: [[number, number], [number, number]] | null;
}

/** How close fitting a bubble's places goes: a few streets, never one. */
export const SPREAD_MAX_ZOOM = 14;
/** Room around them, in pixels, so no pin sits on the edge. */
export const SPREAD_PADDING = 64;

/** The point of a GeoJSON feature, or null. */
function pointOf(feature: unknown): [number, number] | null {
  const geometry = (feature as { geometry?: { type?: string; coordinates?: unknown } } | null)
    ?.geometry;
  if (geometry?.type !== 'Point' || !Array.isArray(geometry.coordinates)) return null;
  const [lng, lat] = geometry.coordinates as unknown[];
  return typeof lng === 'number' && typeof lat === 'number' ? [lng, lat] : null;
}

/** The bounds of these points, or null when they are all at one place. */
export function spreadOf(points: [number, number][]): Picked['spread'] {
  if (points.length < 2) return null;
  const lngs = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  // Five decimals is about a metre: closer than that is one place.
  if (east - west < 1e-5 && north - south < 1e-5) return null;
  return [
    [west, south],
    [east, north],
  ];
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
  const points: [number, number][] = [];
  let clustered = false;
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
      const point = pointOf(hit);
      if (point) points.push(point);
      continue;
    }
    clustered = true;
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
      const point = pointOf(leaf);
      if (point) points.push(point);
    }
    if (!zoomTo) {
      const zoom = await source.getClusterExpansionZoom(properties.cluster_id);
      zoomTo = { center: tapped, zoom };
    }
  }
  return { keys, zoomTo, spread: clustered ? spreadOf(points) : null };
}

export const boxOf = (map: MapLibreMap): Box => {
  const bounds = map.getBounds();
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
};

/** A double on a pin (the owner, 2026-10-26): how close each kind goes. */
export const STREET_ZOOM = 17;
/** A place known only by its city: closer would point at one street. */
export const CITY_CLOSE_ZOOM = 12;
/** Members are counted by ZIP code or city: never closer than this. */
export const PEER_CITY_ZOOM = 11;

export interface CloseUp {
  center: [number, number];
  zoom: number;
}

/** Where a double on this pin goes: a cluster to where it splits, a place up close. */
export async function closeUpOf(map: MapLibreMap, hit: MapGeoJSONFeature): Promise<CloseUp | null> {
  const layer = LAYERS.find((name) => SOURCES[name] === hit.source);
  const geometry = (hit as unknown as { geometry: { type: string; coordinates: number[] } })
    .geometry;
  if (!layer || geometry.type !== 'Point') return null;
  const [lng = 0, lat = 0] = geometry.coordinates;
  const center: [number, number] = [lng, lat];
  const properties = hit.properties as { cluster_id?: number; exact?: boolean };
  if (typeof properties.cluster_id === 'number') {
    const source = map.getSource<GeoJSONSource>(SOURCES[layer]);
    if (!source) return null;
    return { center, zoom: await source.getClusterExpansionZoom(properties.cluster_id) };
  }
  // Already closer than a city: centred, not zoomed out.
  if (layer === 'peers') return { center, zoom: Math.max(map.getZoom(), PEER_CITY_ZOOM) };
  return { center, zoom: properties.exact === true ? STREET_ZOOM : CITY_CLOSE_ZOOM };
}

/** Zooms to fit a bubble's places, never closer than a few streets. */
export function fitSpread(map: MapLibreMap, spread: NonNullable<Picked['spread']>): void {
  map.fitBounds(spread, { padding: SPREAD_PADDING, maxZoom: SPREAD_MAX_ZOOM });
}
