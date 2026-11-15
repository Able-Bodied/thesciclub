/**
 * Unsent words in a message or reply box, kept on this device per
 * conversation or topic (the owner, 2026-11-10), so switching tabs and coming
 * back finds them. sessionStorage, as Home's ask box does: gone when the tab or
 * app closes, and on sign-out, so the next person on a shared device does not
 * read them.
 */
const PREFIX = 'club:draft:';

export function readDraft(key: string): string {
  try {
    return sessionStorage.getItem(PREFIX + key) ?? '';
  } catch {
    return '';
  }
}

export function writeDraft(key: string, text: string) {
  try {
    if (text) sessionStorage.setItem(PREFIX + key, text);
    else sessionStorage.removeItem(PREFIX + key);
  } catch {
    // Private browsing: the draft is simply not kept.
  }
}

/** Every kept draft, Home's ask box's too. For sign-out. */
export function forgetDrafts() {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(PREFIX) || key.startsWith('club:quick-ask:'))
        sessionStorage.removeItem(key);
    }
  } catch {
    // Nothing kept.
  }
  handed.clear();
}

/**
 * Photographs handed to a conversation's box from elsewhere: the selfie taken
 * on checking in to an event (the owner, 2026-11-15). In memory only, as a
 * File cannot be kept, until that box opens with them; nothing leaves the
 * phone before Send.
 */
const handed = new Map<string, File[]>();

export function handPhotos(key: string, files: File[]) {
  handed.set(key, files);
}

/** What was handed to this box, left in place: a box drawn twice finds it both times. */
export function handedPhotos(key: string | undefined): File[] {
  return key ? (handed.get(key) ?? []) : [];
}

export function forgetHandedPhotos(key: string) {
  handed.delete(key);
}
