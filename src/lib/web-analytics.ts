import { isNative } from '@/lib/standalone';
import { sessionStorageKey } from '@/lib/url-session';

/**
 * Cloudflare Web Analytics (the owner, 2026-11-06): visits to the public
 * pages by people who are not signed in. Counts only, no cookies; members are
 * in Admin → Stats instead.
 *
 * Its script reports the page's address, query included, so it loads only on
 * the pages below with nothing in the address that could be a code. Not with a
 * session: an outside script could read it. Not in the store app. Once per
 * load, with its following of in-app navigation off.
 */

/** From Cloudflare's dashboard. Public: it is in the page. Empty: nothing loads. */
export const CF_ANALYTICS_TOKEN = 'ea21a9f0317846938ebd0abe64ea5aa6';

export const CF_BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const COUNTED = new RegExp(
  `^/(e/${UUID}(/register)?|privacy|terms|delete-account|request-invite|join)/?$`,
  'i',
);

/** Whether this address may be reported: a public page, and no code in it. */
export function countedPage(pathname: string, search: string, hash: string): boolean {
  if (hash !== '' || !COUNTED.test(pathname)) return false;
  if (search === '') return true;
  // The welcome page a signed-out visitor is sent to.
  return /^\/join\/?$/.test(pathname) && search === '?next=%2Fhome';
}

function signedIn(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) return false;
  try {
    return window.localStorage.getItem(sessionStorageKey(url)) !== null;
  } catch {
    // Storage blocked: a session could still be in memory; count nothing.
    return true;
  }
}

let started = false;

/** Loads Cloudflare's script if this page may be counted. */
export function countVisit(
  { pathname, search, hash }: { pathname: string; search: string; hash: string },
  token = CF_ANALYTICS_TOKEN,
): void {
  if (started || token === '' || isNative() || !import.meta.env.PROD) return;
  if (!countedPage(pathname, search, hash) || signedIn()) return;
  started = true;
  const script = document.createElement('script');
  script.defer = true;
  script.src = CF_BEACON_SRC;
  script.dataset.cfBeacon = JSON.stringify({ token, spa: false });
  document.head.append(script);
}

/** For tests. */
export function resetCountVisit(): void {
  started = false;
}
