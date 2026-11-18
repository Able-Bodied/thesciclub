import { useSyncExternalStore } from 'react';

/**
 * Draws its caller again when the minute changes, so "5 minutes ago"
 * (`chatTime`, time.ts) does not still say five an hour later on a screen
 * left open. One timer for the whole app, running only while something that
 * shows such a time is on screen.
 */
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Looked at four times a minute: the snapshot only changes on the minute,
  // and a tab that slept catches up on its first look.
  timer ??= setInterval(() => {
    for (const each of listeners) each();
  }, 15_000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function minute(): number {
  return Math.floor(Date.now() / 60_000);
}

export function useMinute(): number {
  return useSyncExternalStore(subscribe, minute, minute);
}
