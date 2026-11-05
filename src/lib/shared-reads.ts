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

const directoryListeners = new Set<() => void>();

/** For a read of the directory, to let go when who is in it may have changed. */
export function onDirectoryChanged(listener: () => void): void {
  directoryListeners.add(listener);
}

/** This device blocked or unblocked someone, or changed its own profile. */
export function directoryChanged(): void {
  for (const listener of directoryListeners) listener();
}

const photoListeners = new Set<() => void>();
/** At most one re-read per this long, however many faces fail at once. */
export const PHOTO_RECHECK_MS = 30_000;
let lastPhotoRecheck: number | null = null;

/** For a kept read that names photographs, to read again behind what it shows. */
export function onPhotoBroke(listener: () => void): void {
  photoListeners.add(listener);
}

/**
 * A photograph would not load: likely changed elsewhere, its old file gone.
 * Kept reads are read again behind what they show, once per PHOTO_RECHECK_MS.
 */
export function photoBroke(now = Date.now()): void {
  if (lastPhotoRecheck !== null && now - lastPhotoRecheck < PHOTO_RECHECK_MS) return;
  lastPhotoRecheck = now;
  for (const listener of photoListeners) listener();
}

onForgetSharedReads(() => {
  lastPhotoRecheck = null;
});
