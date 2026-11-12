/**
 * Fetches a page or picture for link-preview, from Cloudflare's network.
 *
 * link-preview checks that a member's link resolves to a public address, but
 * its own fetch resolved the name again, so a name that changed its answer in
 * between (DNS rebinding) could reach an address inside Supabase. Fetched
 * here, nothing inside Supabase is reachable at all (owner, 2026-11-12; the
 * nightly check link_preview_guard/dns_rebinding).
 *
 * Only link-preview calls it, with a secret. It fetches one http(s) address
 * by name on the usual ports, never follows a redirect (link-preview checks
 * each hop), and passes back at most 2 MB within six seconds: the status,
 * type and Location in x-upstream-* headers, the bytes as the body.
 */

interface Env {
  FETCH_SECRET?: string;
  FETCH_SECRET_TEST?: string;
}

const LIMIT = 2 * 1024 * 1024;
const TIMEOUT_MS = 6000;
const ACCEPTS = new Set([
  'text/html,application/xhtml+xml',
  'application/json',
  'image/webp,image/jpeg,image/png,image/gif',
]);

function equal(a: string, b: string): boolean {
  if (a === '' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** An address by name, http(s), on 80 or 443, with no user or password. */
export function allowed(href: unknown): URL | null {
  if (typeof href !== 'string') return null;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '80' && url.port !== '443') return null;
  // No address literals: a name, which Cloudflare resolves on the public internet.
  if (url.hostname.startsWith('[') || /^[\d.]+$/.test(url.hostname)) return null;
  if (!url.hostname.includes('.')) return null;
  return url;
}

/** The body, cut off after `limit` bytes. */
function capped(body: ReadableStream<Uint8Array>, limit: number): ReadableStream<Uint8Array> {
  let size = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (size >= limit) return;
        const room = limit - size;
        controller.enqueue(chunk.byteLength > room ? chunk.subarray(0, room) : chunk);
        size += Math.min(chunk.byteLength, room);
        if (size >= limit) controller.terminate();
      },
    }),
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') return new Response('POST only', { status: 405 });
    const secret = request.headers.get('x-fetch-secret') ?? '';
    if (!equal(secret, env.FETCH_SECRET ?? '') && !equal(secret, env.FETCH_SECRET_TEST ?? '')) {
      return new Response('Not link-preview', { status: 403 });
    }
    let body: { url?: unknown; accept?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return new Response('Bad body', { status: 400 });
    }
    const url = allowed(body.url);
    const accept = typeof body.accept === 'string' && ACCEPTS.has(body.accept) ? body.accept : null;
    if (!url || !accept) return new Response('Not fetched', { status: 400 });

    let upstream: Response;
    try {
      upstream = await fetch(url.href, {
        redirect: 'manual',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; TheSCIClubLinkPreview/1.0; +https://thesciclub.com)',
          Accept: accept,
          'Accept-Language': 'en-US,en;q=0.8',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return new Response('Unreachable', { status: 502 });
    }
    const headers = new Headers({
      'x-upstream-status': String(upstream.status),
      'x-upstream-type': upstream.headers.get('content-type') ?? '',
      'x-upstream-location': upstream.headers.get('location') ?? '',
      'x-upstream-length': upstream.headers.get('content-length') ?? '',
    });
    const isRedirect = upstream.status >= 300 && upstream.status < 400;
    if (isRedirect || !upstream.body) {
      await upstream.body?.cancel();
      return new Response(null, { status: 200, headers });
    }
    return new Response(capped(upstream.body, LIMIT), { status: 200, headers });
  },
};
