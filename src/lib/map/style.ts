import { type Flavor, layers, namedFlavor } from '@protomaps/basemaps';
import type {
  LayerSpecification,
  RequestParameters,
  StyleSpecification,
  TransformStyleFunction,
} from 'maplibre-gl';
import { MAP_FONT } from './index';
import { archiveUrl, CA_MINZOOM, CALIFORNIA } from './tiles';

/**
 * The basemap: Protomaps' light or dark style over two archives. `us` covers
 * the country to z7; `ca` adds street detail inside California, drawn over it.
 * Glyphs and sprites are the club's own copies (public/map/v1/).
 */

export const FONT = MAP_FONT;
/** Latin, Latin Extended-A, Vietnamese and punctuation; scripts/map-tiles.mjs fetches these. */
export const GLYPH_RANGES = ['0-255', '256-511', '7680-7935', '8192-8447'];

// Busy and not what the map is for.
const LEFT_OUT = new Set(['pois', 'address_label', 'roads_oneway', 'buildings']);

function assets(): string {
  return new URL('/map/v1/', window.location.href).href;
}

/** The Latin glyphs every label needs first. */
export function firstGlyphsUrl(): string {
  return `${assets()}fonts/${encodeURIComponent(FONT)}/0-255.pbf`;
}

/**
 * Protomaps' dark roads sit at 1.5:1 on the land and its labels near 2:1.
 * Lifted to about 2:1 to 3:1 for roads and 5:1 and up for labels: readable,
 * still quieter than the pins.
 */
export const DARK_FLAVOR: Flavor = {
  ...namedFlavor('dark'),
  other: '#4d4d4d',
  minor_service: '#4d4d4d',
  minor_a: '#555555',
  minor_b: '#555555',
  link: '#5a5a5a',
  major: '#606060',
  highway: '#6e6e6e',
  bridges_other: '#4d4d4d',
  bridges_minor: '#555555',
  bridges_link: '#5a5a5a',
  bridges_major: '#606060',
  bridges_highway: '#6e6e6e',
  boundaries: '#6b7385',
  roads_label_minor: '#8a8a8a',
  roads_label_major: '#9a9a9a',
  subplace_label: '#9a9a9a',
  city_label: '#c4c4c4',
  state_label: '#8a8a8a',
  country_label: '#a3a3a3',
  ocean_label: '#8f97a8',
};

function sourceLayers(source: 'us' | 'ca', dark: boolean): LayerSpecification[] {
  return layers(source, dark ? DARK_FLAVOR : namedFlavor('light'), { lang: 'en' })
    .filter((layer) => !LEFT_OUT.has(layer.id) && (source === 'us' || layer.type !== 'background'))
    .map((layer) => {
      const named = { ...layer, id: `${source}-${layer.id}` };
      // One face for every label, so one set of glyph files.
      if (named.type === 'symbol' && named.layout?.['text-font'] !== undefined) {
        return { ...named, layout: { ...named.layout, 'text-font': [FONT] } };
      }
      return named;
    });
}

export function basemapStyle(dark: boolean): StyleSpecification {
  return {
    version: 8,
    glyphs: `${assets()}fonts/{fontstack}/{range}.pbf`,
    sprite: `${assets()}sprites/${dark ? 'dark' : 'light'}`,
    sources: {
      us: { type: 'vector', url: `pmtiles://${archiveUrl('us')}` },
      // Bounds keep it from asking for tiles outside the state.
      ca: {
        type: 'vector',
        url: `pmtiles://${archiveUrl('ca')}`,
        minzoom: CA_MINZOOM,
        bounds: CALIFORNIA,
      },
    },
    layers: [...sourceLayers('us', dark), ...sourceLayers('ca', dark)],
  };
}

/** A glyph file we do not keep becomes an empty one: no glyphs, no error. */
export function glyphRequest(url: string): RequestParameters | undefined {
  const match = /\/map\/v1\/fonts\/([^/]+)\/(\d+-\d+)\.pbf$/.exec(url);
  if (!match) return undefined;
  const [, stack = '', range = ''] = match;
  if (decodeURIComponent(stack) === FONT && GLYPH_RANGES.includes(range)) return undefined;
  return { url: `${assets()}fonts/empty.pbf` };
}

/** On a theme change, keeps the sources and layers a caller added. */
export const keepCallerLayers: TransformStyleFunction = (previous, next) => {
  if (!previous) return next;
  const ours = new Set(next.layers.map((layer) => layer.id));
  return {
    ...next,
    sources: { ...previous.sources, ...next.sources },
    layers: [...next.layers, ...previous.layers.filter((layer) => !ours.has(layer.id))],
  };
};
