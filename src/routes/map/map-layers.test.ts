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
    for (const id of ['club-peer', 'club-organization', 'club-organization-ring', 'club-home']) {
      addIcon(map as never, id);
    }
    expect(map.addImage).toHaveBeenCalledTimes(4);
    expect(calls).toContain('arcTo');
    expect(calls).not.toContain('roundRect');
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
      on: vi.fn(),
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
