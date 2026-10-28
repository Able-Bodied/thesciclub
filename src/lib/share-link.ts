/**
 * Hands a link to the phone's share sheet (AirDrop, Messages, WhatsApp…), or
 * copies it where there is none (most desktop browsers). The owner,
 * 2026-10-14: at a booth, AirDrop needs no camera and no typing.
 */
export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export async function shareLink(link: {
  url: string;
  title: string;
  text: string;
}): Promise<ShareOutcome> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(link);
      return 'shared';
    } catch (e) {
      // Closing the sheet is a choice, not a failure.
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(link.url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/**
 * Copies a link that is still being made (the owner, 2026-10-28: "Make a
 * link" makes the code and copies it in one press). Safari copies only inside
 * the tap, so where it can the clipboard is handed the promise at once, as a
 * ClipboardItem; elsewhere the text is written once it arrives. Resolves to
 * the link, and whether it reached the clipboard; null when none was made.
 */
export async function copyWhenReady(
  link: Promise<string | null>,
): Promise<{ url: string; copied: boolean } | null> {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  if (clipboard && typeof clipboard.write === 'function' && typeof ClipboardItem === 'function') {
    const text = link.then((url) => {
      if (url === null) throw new Error('No link was made.');
      return new Blob([url], { type: 'text/plain' });
    });
    const written = clipboard.write([new ClipboardItem({ 'text/plain': text })]).then(
      () => true,
      () => false,
    );
    const url = await link;
    if (url === null) return null;
    if (await written) return { url, copied: true };
    // Refused the promise (an older browser): the text itself, late.
  }
  const url = await link;
  if (url === null) return null;
  try {
    await navigator.clipboard.writeText(url);
    return { url, copied: true };
  } catch {
    return { url, copied: false };
  }
}
