import type { ClipboardEvent } from 'react';

/**
 * Pasting a picture into the words beside a photo picker (the owner,
 * 2026-10-22): anywhere a photograph can be attached, one can be pasted
 * into the text box too, which is quicker than the file picker for a
 * screenshot or a picture copied from another app.
 *
 * The picker stays the one place that decides what may be attached: the
 * paste hands the pictures to it (`PhotoTarget.add`), so four, images only
 * and 10MB are checked, and said, exactly as for a picture chosen with the
 * button. Text in the same paste still lands as text.
 */

/** Something that takes pasted pictures: the photo picker, or an event's cover. */
export interface PhotoTarget {
  add: (files: File[]) => void;
}

/** The pictures in a paste, if any. Other files and plain text are left out. */
export function pastedImages(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = Array.from(data.files);
  // Some browsers list a copied picture only as an item, not in `files`.
  const listed = files.length
    ? files
    : Array.from(data.items)
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
  return listed.filter((file) => file.type.startsWith('image/'));
}

/**
 * For a text box's onPaste: pictures go to the target, words go in the box.
 * A paste with no picture, or with nowhere to put one (a message being
 * edited, which keeps its photographs), is left to the box as before.
 */
export function pastePhotos(event: ClipboardEvent, target: PhotoTarget | null): void {
  const images = pastedImages(event.clipboardData);
  if (images.length === 0 || !target) return;
  // A picture copied from a page often brings its words along: they still
  // paste. A picture alone would otherwise paste nothing, or its file name.
  if (!event.clipboardData.getData('text/plain')) event.preventDefault();
  target.add(images);
}
