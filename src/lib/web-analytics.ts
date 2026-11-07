import { screenOf } from '@/lib/page-speed';
import { isNative } from '@/lib/standalone';

/**
 * Cloudflare Web Analytics (the owner, 2026-11-06; everyone, signed in or not,
 * 2026-11-07). Cloudflare's script never runs on the club's pages, where a
 * session could be read: it runs in a hidden frame on another origin
 * (count-worker/), which is told only the kind of page, /events/:id, never
 * which one, a query or a code. Not in the store app.
 */

/** The counting page (count-worker/); netlify.toml's frame-src names it. */
export const COUNT_HOME = 'https://sciclub-count.thesciclub.workers.dev';
/** Empty: nothing loads. */
const COUNT_ORIGIN = COUNT_HOME;

/** After the first redirects (/ to /home), and off the first paint. */
export const START_MS = 1000;

let frame: HTMLIFrameElement | null = null;
let ready = false;
let starting = false;
/** The kind the frame shows, and the kind open now. */
let shown = '';
let wanted = '';

function tell(origin: string): void {
  if (!frame || !ready || wanted === shown) return;
  frame.contentWindow?.postMessage(wanted, origin);
  shown = wanted;
}

/** Counts this page by its kind; the frame follows each page after. */
export function countVisit(pathname: string, origin: string = COUNT_ORIGIN): void {
  if (origin === '' || isNative() || !import.meta.env.PROD) return;
  wanted = screenOf(pathname);
  if (frame) {
    tell(origin);
    return;
  }
  if (starting) return;
  starting = true;
  window.setTimeout(() => {
    const made = document.createElement('iframe');
    made.src = `${origin}${wanted}`;
    made.title = 'Visit count';
    made.tabIndex = -1;
    made.setAttribute('aria-hidden', 'true');
    // Its own origin, for Cloudflare's report; no top navigation, no popups.
    made.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    made.referrerPolicy = 'no-referrer';
    made.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
    made.addEventListener('load', () => {
      ready = true;
      tell(origin);
    });
    shown = wanted;
    frame = made;
    document.body.append(made);
  }, START_MS);
}

/** For tests. */
export function resetCountVisit(): void {
  frame?.remove();
  frame = null;
  ready = false;
  starting = false;
  shown = '';
  wanted = '';
}
