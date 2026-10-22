import { isNative } from '@/lib/standalone';

/** The club's address, wherever a link made here is opened. */
export const SITE_ORIGIN = 'https://thesciclub.com';

/**
 * The origin for a link somebody else opens: an email, a QR code, a share.
 * In the store app the page's own origin is capacitor://localhost (Android:
 * https://localhost), which means nothing outside it.
 */
export function siteOrigin(): string {
  return isNative() ? SITE_ORIGIN : window.location.origin;
}
