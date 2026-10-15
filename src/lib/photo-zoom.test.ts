import { describe, expect, it } from 'vitest';
import {
  type Box,
  clampPan,
  clampScale,
  MAX_SCALE,
  panBy,
  UNZOOMED,
  zoomAt,
} from '@/lib/photo-zoom';

// A 400 by 300 picture centred on a 400 by 800 phone.
const BOX: Box = {
  centreX: 200,
  centreY: 400,
  width: 400,
  height: 300,
  viewWidth: 400,
  viewHeight: 800,
};

describe('photo zoom', () => {
  it('keeps the point under the fingers where it was', () => {
    // The point 50px right of the centre, 20px up, on a picture that fills the
    // screen's height, so there is room to move both ways.
    const tall = { ...BOX, viewHeight: 300 };
    function onScreen(zoom: { scale: number; x: number; y: number }, px: number, py: number) {
      return {
        x: tall.centreX + zoom.x + px * zoom.scale,
        y: tall.centreY + zoom.y + py * zoom.scale,
      };
    }
    const zoomed = zoomAt(UNZOOMED, 2, 250, 380, tall);
    expect(zoomed.scale).toBe(2);
    expect(onScreen(zoomed, 50, -20)).toEqual({ x: 250, y: 380 });
    const further = zoomAt(zoomed, 3, 250, 380, tall);
    const at = onScreen(further, 50, -20);
    expect(at.x).toBeCloseTo(250);
    expect(at.y).toBeCloseTo(380);
  });

  it('never goes below fitted or past the most', () => {
    expect(clampScale(0.4)).toBe(1);
    expect(clampScale(99)).toBe(MAX_SCALE);
    expect(zoomAt(UNZOOMED, 0.5, 10, 10, BOX)).toEqual(UNZOOMED);
  });

  it('stops at the picture’s edges', () => {
    const zoomed = zoomAt(UNZOOMED, 2, 200, 400, BOX);
    // 800 wide on a 400 screen: 200 to spare each side.
    expect(panBy(zoomed, 1000, 0, BOX).x).toBe(200);
    expect(panBy(zoomed, -1000, 0, BOX).x).toBe(-200);
    // 600 tall on an 800 screen: no room to move up or down.
    expect(panBy(zoomed, 0, 500, BOX).y).toBe(0);
  });

  it('is centred again at fitted', () => {
    expect(clampPan({ scale: 1, x: 40, y: -30 }, BOX)).toEqual(UNZOOMED);
  });
});
