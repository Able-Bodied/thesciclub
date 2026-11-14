import { describe, expect, it, vi } from 'vitest';
import { fittedSize, MAX_PHOTO_EDGE, preparePhoto, prepareThumb, THUMB_EDGE } from '@/lib/image';
import { sniffImageType } from '../../supabase/functions/_shared/image-type';

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
  /** A file that starts like a JPEG, as a phone photograph does. */
  const file = (name: string, size = 2_642_000) => {
    const bytes = new Uint8Array(size);
    bytes.set([0xff, 0xd8, 0xff, 0xe0]);
    return new File([bytes], name, { type: 'image/jpeg' });
  };

  // Every step is best-effort. savePhoto already refuses to let a failed upload
  // cost somebody their signup; this is the same rule one layer up. An
  // unprocessed 2MB photograph is a slow profile. A thrown exception is none.
  it('falls back to the original where the browser cannot decode images', async () => {
    const original = file('holiday.JPEG');
    const result = await preparePhoto(original);
    expect(result.blob).toBe(original);
    expect(result.ext).toBe('jpg');
  });

  // Nightly check uploads/nonimage_as_jpg: storage trusts the label, so the
  // original is labelled by its bytes, and a non-image is one no bucket takes.
  it('labels an undecodable original by its bytes, and a non-image as one no bucket takes', async () => {
    const text = new File(['this is not a jpeg, just text'], 'cat.jpg', { type: 'image/jpeg' });
    const refused = await preparePhoto(text);
    expect(refused.blob.type).toBe('application/octet-stream');

    const png = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])],
      'a.jpg',
      {
        type: 'image/jpeg',
      },
    );
    const relabelled = await preparePhoto(png);
    expect(relabelled.blob.type).toBe('image/png');
    expect(relabelled.ext).toBe('png');
  });

  it('falls back when decoding throws, rather than propagating', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.reject(new Error('not an image'))),
    );
    const original = file('not-really.png');
    const result = await preparePhoto(original);
    expect(result.blob).toBe(original);
    expect(result.ext).toBe('jpg');
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

describe('prepareThumb', () => {
  function canvasOf(width: number, height: number) {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve({ width, height, close: () => undefined })),
    );
    const drawn: { width: number; height: number; type?: string } = { width: 0, height: 0 };
    const canvas = {
      set width(value: number) {
        drawn.width = value;
      },
      set height(value: number) {
        drawn.height = value;
      },
      getContext: () => ({ drawImage: () => undefined }),
      toBlob: (resolve: (blob: Blob | null) => void, type: string) => {
        drawn.type = type;
        resolve(new Blob([new Uint8Array(20_000)], { type }));
      },
    };
    vi.spyOn(document, 'createElement').mockImplementation(
      () => canvas as unknown as HTMLCanvasElement,
    );
    return drawn;
  }

  it('fits a fitted photograph to the small edge, in its own encoding', async () => {
    const drawn = canvasOf(600, 800);
    const thumb = await prepareThumb(new Blob(['x'], { type: 'image/jpeg' }));
    expect(drawn).toEqual({ width: 300, height: THUMB_EDGE, type: 'image/jpeg' });
    expect(thumb?.type).toBe('image/jpeg');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('makes none for a photograph already that small, or one it cannot write', async () => {
    canvasOf(300, 400);
    expect(await prepareThumb(new Blob(['x'], { type: 'image/webp' }))).toBeNull();
    canvasOf(600, 800);
    expect(await prepareThumb(new Blob(['x'], { type: 'image/png' }))).toBeNull();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('makes none where the browser cannot decode images', async () => {
    expect(await prepareThumb(new Blob(['x'], { type: 'image/webp' }))).toBeNull();
  });
});

// upload-guard deletes whatever this does not recognise, so a miss here would
// delete every photograph of that type, not just refuse a fake.
describe('sniffImageType', () => {
  it('knows each kept type by its first bytes, and nothing else', () => {
    const bytes = (...parts: (string | number[])[]) =>
      new Uint8Array(
        parts.flatMap((p) => (typeof p === 'string' ? Array.from(new TextEncoder().encode(p)) : p)),
      );
    expect(sniffImageType(bytes([0xff, 0xd8, 0xff, 0xdb]))).toBe('image/jpeg');
    expect(sniffImageType(bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffImageType(bytes('RIFF', [0x24, 0x10, 0, 0], 'WEBPVP8 '))).toBe('image/webp');
    expect(sniffImageType(bytes('GIF89a', [1, 0]))).toBe('image/gif');
    expect(sniffImageType(bytes('RIFF', [0, 0, 0, 0], 'WAVEfmt '))).toBeNull();
    expect(sniffImageType(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImageType(bytes([0xff, 0xd8]))).toBeNull();
  });
});
