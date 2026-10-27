import type { StyleSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import {
  basemapStyle,
  DARK_FLAVOR,
  FONT,
  firstGlyphsUrl,
  GLYPH_RANGES,
  glyphRequest,
  keepCallerLayers,
} from './style';
import { TILES_BUILD } from './tiles';

describe('the basemap style', () => {
  const light = basemapStyle(false);
  const dark = basemapStyle(true);

  it('reads the one archive from the tiles folder, by build', () => {
    expect(light.sources).toEqual({
      usa: {
        type: 'vector',
        url: `pmtiles://${window.location.origin}/tiles/usa-${TILES_BUILD}.pmtiles`,
      },
    });
  });

  it('draws each layer once, over one background', () => {
    const ids = light.layers.map((layer) => layer.id);
    expect(ids[0]).toBe('usa-background');
    expect(ids.filter((id) => id.endsWith('background'))).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('usa-'))).toBe(true);
    expect(ids.some((id) => /pois|buildings|address/.test(id))).toBe(false);
  });

  it('labels in the one face it keeps, from its own glyphs and sprites', () => {
    const fonts = new Set(
      light.layers.flatMap((layer) =>
        layer.type === 'symbol' ? [JSON.stringify(layer.layout?.['text-font'])] : [],
      ),
    );
    expect([...fonts]).toEqual([JSON.stringify([FONT])]);
    expect(light.glyphs).toBe(`${window.location.origin}/map/v1/fonts/{fontstack}/{range}.pbf`);
    expect(light.sprite).toBe(`${window.location.origin}/map/v1/sprites/light`);
    expect(dark.sprite).toBe(`${window.location.origin}/map/v1/sprites/dark`);
  });

  it('is darker in dark', () => {
    const background = (style: StyleSpecification) => {
      const layer = style.layers[0];
      return layer?.type === 'background' ? layer.paint?.['background-color'] : undefined;
    };
    expect(background(dark)).not.toEqual(background(light));
  });
});

describe('glyph requests', () => {
  const base = `${window.location.origin}/map/v1/fonts`;
  it('leaves the ranges it keeps alone', () => {
    for (const range of GLYPH_RANGES) {
      expect(glyphRequest(`${base}/Noto%20Sans%20Regular/${range}.pbf`)).toBeUndefined();
    }
    expect(glyphRequest('https://example.com/tile.pbf')).toBeUndefined();
  });

  it('warms the very file the first labels ask for', () => {
    const asked = basemapStyle(false)
      .glyphs?.replace('{fontstack}', encodeURIComponent(FONT))
      .replace('{range}', '0-255');
    expect(firstGlyphsUrl()).toBe(asked);
    expect(GLYPH_RANGES).toContain('0-255');
  });

  it('sends any other range or face to the empty file', () => {
    const empty = { url: `${base}/empty.pbf` };
    expect(glyphRequest(`${base}/Noto%20Sans%20Regular/1024-1279.pbf`)).toEqual(empty);
    expect(glyphRequest(`${base}/Noto%20Sans%20Devanagari%20Regular%20v1/0-255.pbf`)).toEqual(
      empty,
    );
  });
});

describe('a theme change', () => {
  it("keeps the caller's sources and layers, above the basemap", () => {
    const previous = basemapStyle(false);
    previous.sources.pins = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
    previous.layers.push({ id: 'pins', type: 'circle', source: 'pins' });
    const next = keepCallerLayers(previous, basemapStyle(true));
    expect(next.sources.pins).toEqual(previous.sources.pins);
    expect(next.layers.at(-1)?.id).toBe('pins');
    expect(next.sprite).toBe(basemapStyle(true).sprite);
    expect(next.layers.filter((layer) => layer.id === 'usa-earth')).toHaveLength(1);
  });
});

const dark = basemapStyle(true);

describe('the dark basemap', () => {
  const luminance = (hex: string) => {
    const [r = 0, g = 0, b = 0] = [1, 3, 5]
      .map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
  };
  const land = DARK_FLAVOR.earth;

  it('draws roads that can be seen on the land, the big ones most', () => {
    for (const road of ['minor_a', 'minor_b', 'link'] as const) {
      expect(contrast(DARK_FLAVOR[road], land), road).toBeGreaterThanOrEqual(2);
    }
    expect(contrast(DARK_FLAVOR.major, land)).toBeGreaterThanOrEqual(2.5);
    expect(contrast(DARK_FLAVOR.highway, land)).toBeGreaterThanOrEqual(3);
  });

  it('labels places and roads in text that can be read', () => {
    for (const label of ['city_label', 'subplace_label', 'roads_label_major'] as const) {
      expect(contrast(DARK_FLAVOR[label], land), label).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      contrast(DARK_FLAVOR.roads_label_minor, DARK_FLAVOR.roads_label_minor_halo),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('is the flavor the dark style is drawn in', () => {
    const roads = dark.layers.find((layer) => layer.id === 'usa-roads_highway');
    expect(JSON.stringify(roads?.paint)).toContain(DARK_FLAVOR.highway);
  });
});
