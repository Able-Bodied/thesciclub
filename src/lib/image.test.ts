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

  /**
   * A browser that can draw the image and write some, all or none of the
   * encodings. `toBlob` never fails for a type it cannot write — it hands back
   * a PNG and says nothing — which is exactly what Safari does for webp, and
   * what these stand in for.
   */
  function browserThatWrites(...types: string[]) {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve({ width: 3088, height: 2316, close: () => undefined })),
    );
    const asked: string[] = [];
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => undefined }),
      toBlob: (resolve: (blob: Blob | null) => void, type: string) => {
        asked.push(type);
        const written = types.includes(type) ? type : 'image/png';
        resolve(new Blob([new Uint8Array(200_000)], { type: written }));
      },
    };
    vi.spyOn(document, 'createElement').mockImplementation(
      () => canvas as unknown as HTMLCanvasElement,
    );
    return asked;
  }

  it('stores webp where the browser can write it', async () => {
    browserThatWrites('image/webp', 'image/jpeg');
    const result = await preparePhoto(file('holiday.jpg'));
    expect(result.ext).toBe('webp');
    expect(result.blob.type).toBe('image/webp');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // The case the owner hit on 2026-09-29: an iPhone, a 3MB photograph and a
  // chat bucket that takes 2MB. Falling back to the original meant the
  // photograph was refused; a JPEG at 1,600px is a few hundred kilobytes.
  it('stores a JPEG where the browser cannot write webp, rather than the original', async () => {
    const asked = browserThatWrites('image/jpeg');
    const original = file('IMG_4821.jpeg');
    const result = await preparePhoto(original);
    expect(asked).toEqual(['image/webp', 'image/jpeg']);
    expect(result.blob).not.toBe(original);
    expect(result.blob.type).toBe('image/jpeg');
    expect(result.ext).toBe('jpg');
    expect(result.blob.size).toBeLessThan(original.size);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('falls back to the original where the browser writes neither', async () => {
    browserThatWrites();
    const original = file('holiday.jpg');
    const result = await preparePhoto(original);
    expect(result.blob).toBe(original);
    expect(result.ext).toBe('jpg');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('asks again without the orientation option when a browser refuses it', async () => {
    const bitmap = { width: 3088, height: 2316, close: () => undefined };
    const decode = vi.fn((_file: File, options?: unknown) =>
      options ? Promise.reject(new TypeError('unknown option')) : Promise.resolve(bitmap),
    );
    vi.stubGlobal('createImageBitmap', decode);
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => undefined }),
      toBlob: (resolve: (blob: Blob | null) => void, type: string) => {
        resolve(new Blob([new Uint8Array(200_000)], { type }));
      },
    };
    vi.spyOn(document, 'createElement').mockImplementation(
      () => canvas as unknown as HTMLCanvasElement,
    );
    const result = await preparePhoto(file('holiday.jpg'));
    expect(decode).toHaveBeenCalledTimes(2);
    expect(result.ext).toBe('webp');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
