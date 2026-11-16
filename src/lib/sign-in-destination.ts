/** Only app-relative destinations survive sign-in, including Google redirects. */
export function signInDestination(search: string): string {
  const next = new URLSearchParams(search).get('next');
  let hasControl = false;
  for (let index = 0; index < (next?.length ?? 0); index += 1) {
    if (next && next.charCodeAt(index) < 32) hasControl = true;
  }
  if (!next?.startsWith('/') || next.startsWith('//') || next.includes('\\') || hasControl)
    return '/home';
  const url = new URL(next, 'https://club.invalid');
  if (url.origin !== 'https://club.invalid' || /^\/join\/?$/.test(url.pathname)) return '/home';
  return `${url.pathname}${url.search}${url.hash}`;
}

export function signInDoor(destination: string): string {
  return `/join?${new URLSearchParams({ next: destination })}`;
}

/**
 * The door for an address opened signed out. A code on it (`?from=`, a topic
 * an administrator shared to let people in, 20261116200000) is lifted out to
 * the door itself, where the join page reads it, and left off where they go
 * after.
 */
export function signInDoorFor(pathname: string, search: string, hash = ''): string {
  const params = new URLSearchParams(search);
  const code = params.get(CODE_PARAM)?.trim();
  if (!code) return signInDoor(`${pathname}${search}${hash}`);
  params.delete(CODE_PARAM);
  const rest = params.toString();
  const door = signInDoor(`${pathname}${rest ? `?${rest}` : ''}${hash}`);
  return `${door}&${new URLSearchParams({ [CODE_PARAM]: code }).toString()}`;
}

// QR_PARAM in qr-codes.ts, which this does not import: it is read before the club is.
const CODE_PARAM = 'from';

/*
 * Where a shared link was going, kept on this device (the owner, 2026-10-28):
 * the address carries it through sign-in, but asking for an invite can take
 * days, and the invite's own link does not carry it. Kept for 30 days, and
 * forgotten once reached.
 */
const HELD_KEY = 'sciclub.destination';
const HELD_DAYS = 30;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Keeps a destination other than Home, as signInDestination would allow it. */
export function holdDestination(destination: string): void {
  const safe = signInDestination(`?${new URLSearchParams({ next: destination }).toString()}`);
  if (safe === '/home') return;
  storage()?.setItem(HELD_KEY, JSON.stringify({ to: safe, at: Date.now() }));
}

/** The destination kept on this device, unless it is a month old. */
export function heldDestination(now: number = Date.now()): string | null {
  try {
    const raw = storage()?.getItem(HELD_KEY);
    if (!raw) return null;
    const held = JSON.parse(raw) as { to?: unknown; at?: unknown };
    if (typeof held.to !== 'string' || typeof held.at !== 'number') return null;
    if (now - held.at > HELD_DAYS * 86_400_000) return null;
    const safe = signInDestination(`?${new URLSearchParams({ next: held.to }).toString()}`);
    return safe === '/home' ? null : safe;
  } catch {
    return null;
  }
}

export function forgetDestination(): void {
  storage()?.removeItem(HELD_KEY);
}

/** Where to go once in: the address's own, else the one kept on this device. */
export function arrivalDestination(search: string): string {
  const fromAddress = signInDestination(search);
  return fromAddress !== '/home' ? fromAddress : (heldDestination() ?? '/home');
}
