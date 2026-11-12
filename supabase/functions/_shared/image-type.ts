/**
 * What a file really is, from its first bytes, never its name or label.
 *
 * Storage checks only the type an upload declares, so text sent as
 * image/jpeg was kept (nightly check uploads/nonimage_as_jpg). Used by the
 * app before an upload, link-preview before keeping a picture, and
 * upload-guard after every upload.
 */

/** The image types any bucket takes, with the extension each is stored under. */
export const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Bytes needed to tell them apart. */
export const SNIFF_BYTES = 16;

function startsWith(bytes: Uint8Array, at: number, expected: number[]): boolean {
  if (bytes.length < at + expected.length) return false;
  return expected.every((b, i) => bytes[at + i] === b);
}

const ascii = (text: string) => Array.from(new TextEncoder().encode(text));

/** The image type the bytes begin as, or null when they are no image the club keeps. */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, 0, ascii('RIFF')) && startsWith(bytes, 8, ascii('WEBP'))) {
    return 'image/webp';
  }
  if (startsWith(bytes, 0, ascii('GIF87a')) || startsWith(bytes, 0, ascii('GIF89a'))) {
    return 'image/gif';
  }
  return null;
}
