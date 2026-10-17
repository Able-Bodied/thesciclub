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
