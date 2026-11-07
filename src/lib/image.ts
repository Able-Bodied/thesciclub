/**
 * Getting a member's photograph down to a size the club can serve.
 *
 * Raw phone uploads were 7 megapixels and ~2MB, 70-100 times the seeded photographs, downloaded
 * even to fill a 34px square.
 *
 * Phones write EXIF orientation 6, so a big file appeared to load right to left (the owner's
 * report). `imageOrientation: 'from-image'` bakes the rotation in once, at upload.
 *
 * WebKit (Safari, every iPhone browser) cannot encode webp: `toBlob('image/webp')` quietly
 * returns a PNG, caught by the `blob.type` check. The fallback is JPEG, not the original, since
 * 2026-09-29: the `chat` bucket takes 2MB at most, so phone photographs were refused.
 *
 * Every step is best-effort and falls back to the original file: a slow profile beats none.
 */

/** The long edge, in CSS pixels, that a stored photograph is fitted to. */
export const MAX_PHOTO_EDGE = 800;

/** webp at 0.82: 800px lands near the seeded photographs' 26KB (500px webp), sharp at 2×. */
const QUALITY = 0.82;

/**
 * Encodings tried in order, with their stored extension. JPEG is for WebKit, which can't write
 * webp. Never PNG: larger than the JPEG it came from.
 */
const ENCODINGS: [type: string, ext: string][] = [
  ['image/webp', 'webp'],
  ['image/jpeg', 'jpg'],
];

/**
 * The size an image is drawn at, fitted inside a square of `max`. Never upscales. Rounded, as a
 * fractional canvas height truncates into a visible crop on a tall portrait.
 */
export function fittedSize(
  width: number,
  height: number,
  max: number = MAX_PHOTO_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max || longest === 0) return { width, height };
  const scale = max / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** What `preparePhoto` hands back: the bytes to store, and the extension to store them under. */
export interface PreparedPhoto {
  blob: Blob;
  /** 'webp', 'jpg' where webp can't be written (Safari), or the original's extension. */
  ext: string;
}

/**
 * The extension to store an unprocessed file under. Look for the dot: a naive split('.').pop()
 * turns "screenshot" into `profile.screenshot`, served with a type nothing can display.
 */
function originalExtension(file: File): string {
  const dot = file.name.lastIndexOf('.');
  if (dot <= 0) return 'jpg';
  const ext = file.name.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'jpg';
}

/**
 * Decode a file to a bitmap with its EXIF rotation applied ('from-image'); without it the flag
 * is lost in the re-encode. A browser that refuses the option is asked again without it: the
 * default is 'from-image' since 2023, and sideways beats refused.
 */
async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(file);
  }
}

/**
 * Ask the canvas for one encoding; the blob only if it is that type. `toBlob` quietly returns a
 * PNG for a type it cannot write.
 */
async function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, QUALITY);
  });
  return blob?.type === type ? blob : null;
}

/**
 * Fit a photograph to `MAX_PHOTO_EDGE` and re-encode it as webp, or JPEG where webp can't be
 * written. Returns the original untouched if anything goes wrong; `ext` says which happened.
 */
export async function preparePhoto(
  file: File,
  /** The long edge to fit to. Profiles use the default; chat photographs ask for more. */
  max: number = MAX_PHOTO_EDGE,
  /**
   * Painted under the picture, for one that may be transparent. A logo is
   * often a PNG with no ground, and where the browser cannot write webp (an
   * iPhone) it goes out as JPEG, which turns transparency black.
   */
  background?: string,
): Promise<PreparedPhoto> {
  const fallback: PreparedPhoto = { blob: file, ext: originalExtension(file) };
  if (typeof createImageBitmap !== 'function') return fallback;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await decode(file);

    const { width, height } = fittedSize(bitmap.width, bitmap.height, max);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) return fallback;
    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(bitmap, 0, 0, width, height);

    for (const [type, ext] of ENCODINGS) {
      const blob = await encode(canvas, type);
      if (!blob) continue;
      // Shrinking made it bigger — a small PNG screenshot, say. Then the
      // original wins, and it is small enough not to matter.
      if (blob.size >= file.size) return fallback;
      return { blob, ext };
    }
    return fallback;
  } catch {
    return fallback;
  } finally {
    bitmap?.close();
  }
}

/**
 * The long edge of a photograph's small copy, drawn wherever a face is small
 * (avatars, lists, under a Peers card while its photograph arrives). A 3x
 * screen fills an 88px square from its 300px short edge.
 */
export const THUMB_EDGE = 400;

/**
 * A small copy of a fitted photograph, in the same encoding, or null: no
 * canvas, a type other than webp or JPEG, or a photograph already that small.
 * Made from the fitted copy, which is already upright.
 */
export async function prepareThumb(photo: Blob, max: number = THUMB_EDGE): Promise<Blob | null> {
  const type = photo.type === 'image/webp' || photo.type === 'image/jpeg' ? photo.type : null;
  if (!type || typeof createImageBitmap !== 'function') return null;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(photo);
    const { width, height } = fittedSize(bitmap.width, bitmap.height, max);
    if (width === bitmap.width && height === bitmap.height) return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    return await encode(canvas, type);
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}
