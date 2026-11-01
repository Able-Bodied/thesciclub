/**
 * Reads kept in memory and shared between screens (the organizations
 * directory, the tag taxonomy, the calendar feeds) register how to forget
 * themselves here, and are forgotten together: at sign-out, so the next
 * person on the phone reads their own, and between tests.
 *
 * Its own module, importing nothing, so the test setup can reach it without
 * loading the Supabase client ahead of a test file's mock of it.
 */
const forgetters = new Set<() => void>();

export function onForgetSharedReads(forget: () => void): void {
  forgetters.add(forget);
}

export function forgetSharedReads(): void {
  for (const forget of forgetters) forget();
}

const changeListeners = new Set<() => void>();

/** For a read that holds events or organizations, to let go when they change. */
export function onCalendarChanged(listener: () => void): void {
  changeListeners.add(listener);
}

/**
 * This device added, changed or removed an event or an organization. What is
 * kept is let go, so the Events tab reads it all again when it is next shown
 * (it stays mounted, and re-reads then): the list, who is near, the map and
 * the directory (the owner, 2026-11-01).
 */
export function calendarChanged(): void {
  for (const listener of changeListeners) listener();
}
