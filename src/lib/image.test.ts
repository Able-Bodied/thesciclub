import { describe, expect, it, vi } from 'vitest';
import { fittedSize, MAX_PHOTO_EDGE, preparePhoto } from '@/lib/image';

describe('fittedSize', () => {
  it('fits a landscape photo by its long edge', () => {
    // The real case: 3088x2316 off a phone, 7.2 megapixels, drawn a few hundred
    // pixels wide at most and 34px on the organization page.
    expect(fittedSize(3088, 2316)).toEqual({ width: 800, height: 600 });
  });

  it('fits a portrait photo by its long edge too', () => {
    expect(fittedSize(2316, 3088)).toEqual({ width: 600, height: 800 });
  });

  it('leaves a square alone at the limit', () => {
    expect(fittedSize(MAX_PHOTO_EDGE, MAX_PHOTO_EDGE)).toEqual({
      width: MAX_PHOTO_EDGE,
      height: MAX_PHOTO_EDGE,
    });
  });

  // Enlarging costs bytes to add nothing, and the initials tile is a better
  // answer to a tiny photograph than a blurry one.
  it('never upscales', () => {
    expect(fittedSize(200, 150)).toEqual({ width: 200, height: 150 });
  });

  it('rounds rather than truncating', () => {
    // 1000x333 scales to 800x266.4. Truncated that is a visible crop off a
    // wide photo, not a rounding error.
    expect(fittedSize(1000, 333)).toEqual({ width: 800, height: 266 });
  });

  it('does not divide by zero on a degenerate image', () => {
    expect(fittedSize(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe('preparePhoto', () => {
  const file = (name: string, size = 2_642_000) => ({ name, size, type: 'image/jpeg' }) as File;

  // Every step is best-effort. savePhoto already refuses to let a failed upload
  // cost somebody their signup; this is the same rule one layer up. An
  // unprocessed 2MB photograph is a slow profile. A thrown exception is none.
  it('falls back to the original where the browser cannot decode images', async () => {
    const original = file('holiday.JPEG');
    const result = await preparePhoto(original);
    expect(result.blob).toBe(original);
    expect(result.ext).toBe('jpeg');
  });

  it('falls back when decoding throws, rather than propagating', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.reject(new Error('not an image'))),
    );
    const original = file('not-really.png');
    const result = await preparePhoto(original);
    expect(result.blob).toBe(original);
    expect(result.ext).toBe('png');
    vi.unstubAllGlobals();
  });

  it('gives a sane extension to a file that has none', async () => {
    const result = await preparePhoto(file('screenshot'));
    expect(result.ext).toBe('jpg');
  });
});
