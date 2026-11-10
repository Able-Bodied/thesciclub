/**
 * Where each tab was left, so going back to it lands there (the owner,
 * 2026-11-10: switching tabs mid-message closed the conversation). In memory
 * only, for this visit, and forgotten on sign-out (lib/account.tsx).
 */
const leftAt = new Map<string, { path: string; state: unknown }>();

export function rememberTabPlace(tab: string, path: string, state: unknown) {
  leftAt.set(tab, { path, state });
}

export function tabPlace(tab: string): { path: string; state: unknown } | undefined {
  return leftAt.get(tab);
}

export function forgetTabPlaces() {
  leftAt.clear();
}
