/**
 * Zooming into a photograph in the viewer (the owner, 2026-10-15): the sums,
 * kept apart from the gestures so they can be tested.
 *
 * The picture is drawn fitted and centred, then moved by `x`, `y` and scaled
 * by `scale` about its centre (`translate(x, y) scale(scale)`). Zooming keeps
 * the point under the fingers, or the cursor, where it was; panning stops at
 * the picture's edges, so it can never be lost off the screen.
 */

export interface Zoom {
  scale: number;
  x: number;
  y: number;
}

export const UNZOOMED: Zoom = { scale: 1, x: 0, y: 0 };

/** Enough to read a label on a box in a 1,600px photograph on a phone. */
export const MAX_SCALE = 5;

/** What a double tap, or a zoom button from the start, goes to. */
export const TAP_SCALE = 2.5;

/** Each press of a zoom button, or a key. */
export const STEP = 1.5;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(1, scale));
}

export interface Box {
  /** The fitted picture's centre on screen, before it was moved. */
  centreX: number;
  centreY: number;
  /** The fitted picture's size, before it was scaled. */
  width: number;
  height: number;
  /** The screen it is shown on. */
  viewWidth: number;
  viewHeight: number;
}

/**
 * Keeps the picture over the screen: a picture wider than the screen stops
 * at its edges, and one narrower stays centred. Back at 1, it is centred.
 */
export function clampPan(zoom: Zoom, box: Box): Zoom {
  if (zoom.scale <= 1) return UNZOOMED;
  const spareX = Math.max(0, (box.width * zoom.scale - box.viewWidth) / 2);
  const spareY = Math.max(0, (box.height * zoom.scale - box.viewHeight) / 2);
  return {
    scale: zoom.scale,
    x: Math.min(spareX, Math.max(-spareX, zoom.x)),
    y: Math.min(spareY, Math.max(-spareY, zoom.y)),
  };
}

/** Zooms to `scale`, keeping the picture's point under (`atX`, `atY`) where it is. */
export function zoomAt(zoom: Zoom, scale: number, atX: number, atY: number, box: Box): Zoom {
  const next = clampScale(scale);
  const ratio = next / zoom.scale;
  const fromCentreX = atX - box.centreX;
  const fromCentreY = atY - box.centreY;
  return clampPan(
    {
      scale: next,
      x: fromCentreX - (fromCentreX - zoom.x) * ratio,
      y: fromCentreY - (fromCentreY - zoom.y) * ratio,
    },
    box,
  );
}

/** Moves a zoomed picture by (`dx`, `dy`), as far as its edges allow. */
export function panBy(zoom: Zoom, dx: number, dy: number, box: Box): Zoom {
  return clampPan({ scale: zoom.scale, x: zoom.x + dx, y: zoom.y + dy }, box);
}

export function isZoomed(zoom: Zoom): boolean {
  return zoom.scale > 1.01;
}
