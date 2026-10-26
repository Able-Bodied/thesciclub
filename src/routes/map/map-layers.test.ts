import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/map', () => ({ MAP_FONT: 'Noto Sans Regular' }));

const { addIcon } = await import('@/routes/map/map-layers');

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
    for (const id of ['club-peer', 'club-organization', 'club-organization-ring']) {
      addIcon(map as never, id);
    }
    expect(map.addImage).toHaveBeenCalledTimes(3);
    expect(calls).toContain('arcTo');
    expect(calls).not.toContain('roundRect');
  });
});
