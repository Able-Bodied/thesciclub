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
