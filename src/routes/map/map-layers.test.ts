import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/map', () => ({ MAP_FONT: 'Noto Sans Regular' }));

const { addIcon, addLayers, setHome } = await import('@/routes/map/map-layers');

/** A 2D context as iOS 15's Safari has it: no roundRect. */
function oldSafariPen() {
  const calls: string[] = [];
  const record =
    (name: string) =>
    (..._args: unknown[]) => {
      calls.push(name);
    };
  return {
    calls,
    pen: {
      scale: record('scale'),
      beginPath: record('beginPath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      arcTo: record('arcTo'),
      arc: record('arc'),
      closePath: record('closePath'),
      fill: record('fill'),
      stroke: record('stroke'),
      fillText: record('fillText'),
      createLinearGradient: () => ({ addColorStop: record('addColorStop') }),
      getImageData: () => ({ width: 68, height: 68, data: new Uint8ClampedArray(68 * 68 * 4) }),
      lineWidth: 1,
      fillStyle: '',
      strokeStyle: '',
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the map's badges", () => {
  it('are drawn with paths, which iOS 15 can do, not roundRect', () => {
    const { pen, calls } = oldSafariPen();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      pen as unknown as CanvasRenderingContext2D,
    );
    const map = { hasImage: () => false, addImage: vi.fn() };
    for (const id of ['club-peer', 'club-organization', 'club-organization-chip', 'club-home']) {
      addIcon(map as never, id);
    }
    expect(map.addImage).toHaveBeenCalledTimes(4);
    expect(calls).toContain('arcTo');
    expect(calls).not.toContain('roundRect');
  });
});

describe("organizations' places", () => {
  function layersOf() {
    const added: { id: string; filter?: unknown; layout?: Record<string, unknown> }[] = [];
    const resolver: { ask?: (id: string) => void } = {};
    const map = {
      hasImage: () => false,
      addImage: vi.fn(),
      setMissingStyleImageResolver: (ask: (id: string) => void) => {
        resolver.ask = ask;
      },
      getSource: () => undefined,
      addSource: vi.fn(),
      getLayer: () => false,
      addLayer: (layer: (typeof added)[number]) => added.push(layer),
    };
    addLayers(map as never);
    return { added, resolver, map };
  }

  it("show each organization's own badge, and a purple count where places run together", () => {
    const badge = layersOf().added.find((layer) => layer.id === 'club-organizations');
    expect(badge?.layout?.['icon-image']).toEqual([
      'case',
      ['has', 'point_count'],
      'club-organization',
      ['concat', 'org-logo-', ['get', 'organizationId']],
    ]);
    expect(badge?.layout?.['text-field']).toEqual([
      'case',
      ['has', 'point_count'],
      ['to-string', ['get', 'count']],
      '',
    ]);
  });

  it('count several organizations at one point on a chip, above their badge', () => {
    const { added } = layersOf();
    const ids = added.map((layer) => layer.id);
    const chip = added.find((layer) => layer.id === 'club-organizations-count');
    expect(ids.indexOf('club-organizations-count')).toBe(ids.indexOf('club-organizations') + 1);
    expect(chip?.filter).toEqual([
      'all',
      ['!', ['has', 'point_count']],
      ['>', ['get', 'count'], 1],
    ]);
    expect(chip?.layout?.['icon-image']).toBe('club-organization-chip');
    expect(chip?.layout?.['text-field']).toEqual(['to-string', ['get', 'count']]);
  });

  it('draw a badge when MapLibre asks for one, as it is needed', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      oldSafariPen().pen as unknown as CanvasRenderingContext2D,
    );
    const { resolver, map } = layersOf();
    map.addImage.mockClear();
    resolver.ask?.('org-logo-borp');
    expect(map.addImage).toHaveBeenCalledWith('org-logo-borp', expect.anything(), {
      pixelRatio: 2,
    });
  });
});

describe('your city', () => {
  function fakeMap() {
    const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
    const layers: string[] = [];
    return {
      layers,
      sources,
      hasImage: () => true,
      addImage: vi.fn(),
      setMissingStyleImageResolver: vi.fn(),
      getSource: (id: string) => sources.get(id),
      addSource: (id: string) => sources.set(id, { setData: vi.fn() }),
      getLayer: (id: string) => layers.includes(id),
      addLayer: (layer: { id: string }) => layers.push(layer.id),
    };
  }

  it('is a house on the map, under every pin so they stay tappable', () => {
    const map = fakeMap();
    addLayers(map as never);
    expect(map.layers[0]).toBe('club-home');
    expect(map.layers).toContain('club-events-one');
  });

  it('sits at the home city, and goes when there is none', () => {
    const map = fakeMap();
    addLayers(map as never);
    const home = map.sources.get('club-home');
    setHome(map as never, [-122.27, 37.8]);
    expect(home?.setData).toHaveBeenLastCalledWith({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-122.27, 37.8] },
          properties: {},
        },
      ],
    });
    setHome(map as never, null);
    expect(home?.setData).toHaveBeenLastCalledWith({ type: 'FeatureCollection', features: [] });
  });
});

describe('one look for every pin', () => {
  it('draws events and organizations the same whether exact or at a city middle', () => {
    const added: unknown[] = [];
    const map = {
      hasImage: () => true,
      addImage: vi.fn(),
      setMissingStyleImageResolver: vi.fn(),
      getSource: () => undefined,
      addSource: vi.fn(),
      getLayer: () => false,
      addLayer: (layer: unknown) => added.push(layer),
    };
    addLayers(map as never);
    const drawn = JSON.stringify(added);
    // The sheet says "Approximate location"; the pin does not change for it.
    expect(drawn).not.toContain('exact');
    expect(drawn).not.toContain('club-organization-ring');
  });
});
