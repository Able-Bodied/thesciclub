/**
 * Getting a member's photograph down to a size the club can serve.
 *
 * ---------------------------------------------------------------------------
 * What was happening without this
 * ---------------------------------------------------------------------------
 * Both upload paths handed the raw `File` straight to storage, so whatever came
 * off the phone is what every member downloaded. Measured on the live bucket:
 * two members at 3088×2316 — 7.2 megapixels — weighing 1.9MB and 2.6MB, against
 * 26KB for the seeded photographs, which had been processed to 500px webp when
 * they were imported. Between 70 and 100 times the size.
 *
 * The profile page draws these a few hundred pixels wide. The organization page
 * draws them at 34×34. A seven-megapixel image was being downloaded to fill a
 * 34 pixel square.
 *
 * ---------------------------------------------------------------------------
 * The rotation, which is the same bug wearing a different coat
 * ---------------------------------------------------------------------------
 * Both files carried EXIF orientation 6 — "rotate 90° clockwise" — because
 * that is what a phone writes when you hold it upright. A baseline JPEG decodes
 * top to bottom; rotate that 90° for display and the top row lands on the right
 * edge, so a slow load appears to fill in *right to left*. That is what the
 * owner reported, and it is not a rendering fault: it is the browser honouring
 * the rotation flag while decoding a file too big to arrive at once.
 *
 * `imageOrientation: 'from-image'` bakes the rotation in here, once, at upload.
 * After that the stored file needs no flag and no viewer has to rotate anything.
 *
 * ---------------------------------------------------------------------------
 * Safari cannot write webp, so the second choice is JPEG
 * ---------------------------------------------------------------------------
 * WebKit — Safari, and every browser on an iPhone — cannot encode webp from a
 * canvas. `toBlob('image/webp')` does not fail; it hands back a PNG, and the
 * check on `blob.type` below is what catches that. Until 2026-09-29 catching
 * it meant falling back to the original file, which for a profile photograph
 * is merely large and for a chat photograph is refused outright: the `chat`
 * bucket takes 2MB at most, and a phone's JPEG is usually more. The owner
 * could not put a photograph on a topic from their phone, and the live bucket
 * showed why — every photograph sent from a phone before then was stored as
 * the original JPEG, not as webp.
 *
 * So the fallback is now a JPEG at the same size and quality, which every
 * browser can write. It is a little larger than the webp would have been and
 * far smaller than the original. The original is the last resort, kept for a
 * browser that cannot draw the image at all.
 *
 * ---------------------------------------------------------------------------
 * A failure here must never cost somebody their photograph
 * ---------------------------------------------------------------------------
 * Every step is best-effort and falls back to the original file. `savePhoto`
 * already refuses to let a failed upload cost somebody their signup; this is
 * the same rule one layer up. An unprocessed 2MB photograph is a slow profile.
 * A thrown exception is no profile at all.
 */

/** The long edge, in CSS pixels, that a stored photograph is fitted to. */
export const MAX_PHOTO_EDGE = 800;

/**
 * webp at 0.82.
 *
 * Chosen against the seeded photographs, which are the reference for what the
 * deck should look like: they are 500px webp at roughly 26KB, and 800px at this
 * quality lands in the same neighbourhood while staying sharp on a profile page
 * at 2× density.
 */
const QUALITY = 0.82;

/**
 * The encodings tried, in order, and the extension each is stored under.
 * webp first, for the bytes; JPEG where the browser cannot write webp, which
 * is WebKit. PNG is never asked for: a PNG of a photograph is larger than
 * the JPEG it came from.
 */
const ENCODINGS: [type: string, ext: string][] = [
  ['image/webp', 'webp'],
  ['image/jpeg', 'jpg'],
];

/**
 * The size an image is drawn at, fitted inside a square of `max`.
 *
 * Never upscales. Somebody who uploads a 200px picture gets a 200px picture —
 * enlarging it would cost bytes to add nothing, and the initials tile is a
 * better answer to a tiny photograph than a blurry one.
 *
 * Rounded, because canvas dimensions are integers and a fractional height
 * silently truncates, which over a tall portrait is a visible crop rather than
 * a rounding error.
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
  /**
   * 'webp' when processing worked, 'jpg' where the browser could shrink the
   * image but not write webp (Safari), and the original file's extension when
   * it could do neither.
   */
  ext: string;
}

/**
 * The extension to store an unprocessed file under.
 *
 * The dot has to be there. `'screenshot'.split('.').pop()` is `'screenshot'`,
 * so the obvious one-liner turns a filename with no extension into
 * `profile.screenshot` — which storage accepts, and which then serves with a
 * content type nothing can display. Found by the test for it, not by reading.
 */
function originalExtension(file: File): string {
  const dot = file.name.lastIndexOf('.');
  if (dot <= 0) return 'jpg';
  const ext = file.name.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'jpg';
}

/**
 * Decode a file to a bitmap with its EXIF rotation applied.
 *
 * 'from-image' is what applies the rotation. Without it the canvas draws the
 * unrotated pixels and the flag is lost in the re-encode, which would leave
 * every one of these photographs on its side. A browser that refuses the
 * option is asked again without it: the spec's default has been 'from-image'
 * since 2023, so the plain call rotates too on anything recent, and a
 * photograph drawn on its side is still better than a photograph refused.
 */
async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(file);
  }
}

/**
 * Ask the canvas for one encoding, and hand back the blob only if that is what
 * it is. `toBlob` does not fail for a type the browser cannot write; it hands
 * back a PNG and says nothing, which is the whole reason for the check.
 */
async function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, QUALITY);
  });
  return blob?.type === type ? blob : null;
}

/**
 * Fit a chosen photograph to `MAX_PHOTO_EDGE` and re-encode it, as webp or,
 * where the browser cannot write webp, as JPEG.
 *
 * Returns the original file untouched if anything at all goes wrong — an older
 * browser without `createImageBitmap`, a canvas that will write neither, a
 * file that is not really an image. The caller cannot tell the difference and
 * does not need to; `ext` says which happened.
 */
export async function preparePhoto(
  file: File,
  /** The long edge to fit to. Profiles use the default; chat photographs ask for more. */
  max: number = MAX_PHOTO_EDGE,
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
