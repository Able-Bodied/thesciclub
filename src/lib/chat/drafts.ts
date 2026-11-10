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
}
