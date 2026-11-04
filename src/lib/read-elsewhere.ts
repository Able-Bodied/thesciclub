/**
 * Tells this member's other tabs that something was read or seen, so their
 * Chat dot, bell and app icon recount at once instead of on their next focus.
 * BroadcastChannel, or a storage event where that is missing. Never delivered
 * to the tab that said it. Other devices hear it through Realtime instead.
 */
const NAME = 'club:read-elsewhere';

const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;

const hear = () => {
  for (const listener of listeners) listener();
};
const onStorage = (e: StorageEvent) => {
  if (e.key === NAME) hear();
};

function hasChannel(): boolean {
  return typeof BroadcastChannel === 'function';
}

/** Said after this tab marks something read or seen. */
export function tellOtherTabs(): void {
  try {
    if (hasChannel()) {
      if (channel) channel.postMessage('read');
      else {
        const once = new BroadcastChannel(NAME);
        once.postMessage('read');
        once.close();
      }
      return;
    }
    // A new value each time, or the storage event does not fire.
    localStorage.setItem(NAME, `${Date.now()}:${Math.random()}`);
  } catch {
    // The other tab still recounts on its next focus.
  }
}

/** Calls `listener` when another tab says so; returns the way to stop. */
export function onReadElsewhere(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    if (hasChannel()) {
      channel = new BroadcastChannel(NAME);
      channel.onmessage = hear;
    } else window.addEventListener('storage', onStorage);
  }
  return () => {
    if (!listeners.delete(listener) || listeners.size > 0) return;
    if (channel) {
      channel.onmessage = null;
      channel.close();
      channel = null;
    }
    window.removeEventListener('storage', onStorage);
  };
}
