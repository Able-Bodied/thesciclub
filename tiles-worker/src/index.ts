/**
 * The map's tiles, from R2 (scripts/map-tiles.mjs uploads them; src/lib/map/
 * tiles.ts points the app here). Read-only, byte ranges, and only for the
 * club's own pages and app. Deployed by the owner: wrangler.toml.
 */

/** The part of R2's binding this uses. */
export interface TileRange {
  offset?: number;
  length?: number;
  suffix?: number;
}
export interface TileObject {
  size: number;
  httpEtag: string;
}
export interface TileObjectBody extends TileObject {
  body: ReadableStream;
}
export interface TilesBucket {
  head(key: string): Promise<TileObject | null>;
  get(key: string, options?: { range?: TileRange }): Promise<TileObjectBody | null>;
}

/** Cloudflare's rate limiting binding (wrangler.toml, [[ratelimits]]). */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  TILES: TilesBucket;
  LIMITER?: RateLimiter;
  /** One more origin to allow, for local testing only, e.g. http://localhost:5173. */
  DEV_ORIGIN?: string;
}

/**
 * Built archives only: usa-20261025.pmtiles. us- and ca- were the two-file
 * builds before it, served until they leave the bucket.
 */
const KEY = /^\/((?:usa|us|ca)-\d{8}\.pmtiles)$/;
const ORIGINS = new Set(['https://thesciclub.com', 'capacitor://localhost', 'https://localhost']);
const IMMUTABLE = 'public, max-age=31536000, immutable';
/**
 * The most one request may read. pmtiles reads exact pieces: 16 KiB for the
 * header, and in the 2026-10-25 build at most a 9.5 KB leaf directory and a
 * 295 KB tile. Seven times that, for denser builds to come.
 */
export const MAX_READ = 2 * 1024 * 1024;
/** The limiter's period in wrangler.toml. */
const LIMIT_PERIOD_S = 60;

/** Over the limit for this address? A limiter that fails lets the request through. */
async function overLimit(request: Request, env: Env): Promise<boolean> {
  if (!env.LIMITER) return false;
  try {
    const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    return !(await env.LIMITER.limit({ key })).success;
  } catch {
    return false;
  }
}

/** A single range, or 'bad' for one we do not serve (several, or malformed). */
export function parseRange(header: string | null): TileRange | 'bad' | undefined {
  if (header === null) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return 'bad';
  const [, first = '', last = ''] = match;
  if (first === '') return last === '' || Number(last) === 0 ? 'bad' : { suffix: Number(last) };
  const offset = Number(first);
  if (last === '') return { offset };
  const end = Number(last);
  return end < offset ? 'bad' : { offset, length: end - offset + 1 };
}

/** Whether an If-Match / If-None-Match list names this ETag. */
export function etagListed(header: string, etag: string): boolean {
  const bare = (tag: string) => tag.trim().replace(/^W\//, '');
  return header.split(',').some((tag) => tag.trim() === '*' || bare(tag) === bare(etag));
}

function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers({ Vary: 'Origin' });
  const origin = request.headers.get('Origin');
  if (origin !== null && (ORIGINS.has(origin) || (env.DEV_ORIGIN && origin === env.DEV_ORIGIN))) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, ETag');
  }
  return headers;
}

function reply(status: number, headers: Headers, body: BodyInit | null = null): Response {
  if (status >= 400) headers.set('Cache-Control', 'no-store');
  return new Response(body, { status, headers });
}

function describe(headers: Headers, object: TileObject): Headers {
  headers.set('Cache-Control', IMMUTABLE);
  headers.set('Content-Type', 'application/octet-stream');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('ETag', object.httpEtag);
  headers.set('X-Content-Type-Options', 'nosniff');
  return headers;
}

async function serve(request: Request, env: Env): Promise<Response> {
  const headers = corsHeaders(request, env);

  if (request.method === 'OPTIONS') {
    if (!headers.has('Access-Control-Allow-Origin')) return reply(403, headers);
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD');
    headers.set('Access-Control-Allow-Headers', 'Range, If-Match');
    headers.set('Access-Control-Max-Age', '86400');
    return reply(204, headers);
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    headers.set('Allow', 'GET, HEAD, OPTIONS');
    return reply(405, headers);
  }

  if (await overLimit(request, env)) {
    headers.set('Retry-After', String(LIMIT_PERIOD_S));
    return reply(429, headers);
  }

  const key = KEY.exec(new URL(request.url).pathname)?.[1];
  if (!key) return reply(404, headers);
  // pmtiles always asks for a range; a whole 600 MB file in one request is
  // someone else. 400, not 416: there is no range here to be unsatisfiable.
  if (request.method === 'GET' && !request.headers.has('Range')) {
    return reply(400, headers, 'Ask for a byte range.');
  }

  const ifMatch = request.headers.get('If-Match');
  const ifNoneMatch = request.headers.get('If-None-Match');
  const range = request.method === 'GET' ? parseRange(request.headers.get('Range')) : undefined;
  const needsSize =
    range !== undefined &&
    range !== 'bad' &&
    range.suffix === undefined &&
    range.length === undefined;

  // The size and ETag first, when the answer depends on them. RFC 9110's
  // order: If-Match, then If-None-Match. The dates are ignored: no
  // Last-Modified is sent, so there is none to compare (RFC 9110, 13.1.3-4).
  let known: TileObject | null = null;
  if (
    request.method === 'HEAD' ||
    ifMatch !== null ||
    ifNoneMatch !== null ||
    range === 'bad' ||
    needsSize
  ) {
    known = await env.TILES.head(key);
    if (!known) return reply(404, headers);
    describe(headers, known);
    if (ifMatch !== null && !etagListed(ifMatch, known.httpEtag)) return reply(412, headers);
    if (ifNoneMatch !== null && etagListed(ifNoneMatch, known.httpEtag)) {
      return reply(304, headers);
    }
    if (request.method === 'HEAD') {
      headers.set('Content-Length', String(known.size));
      return reply(200, headers);
    }
  }
  if (!range || range === 'bad') return unsatisfiable(headers, known?.size);

  // No reading the archive whole by asking for one big range. 400, not 416:
  // the range may well fit the file, and pmtiles answers a 416 at offset 0 by
  // asking for the whole file.
  const asked = bounded(range, known?.size);
  if (asked === 'too-big') return reply(400, headers, `Ask for at most ${MAX_READ} bytes.`);

  let object: TileObjectBody | null;
  try {
    object = await env.TILES.get(key, { range: asked });
  } catch {
    // R2 refuses a range past the end.
    object = null;
  }
  if (!object) {
    const head = known ?? (await env.TILES.head(key));
    return head ? unsatisfiable(headers, head.size) : reply(404, headers);
  }
  describe(headers, object);
  const start =
    asked.suffix !== undefined ? Math.max(0, object.size - asked.suffix) : (asked.offset ?? 0);
  if (start >= object.size) return unsatisfiable(headers, object.size);
  const length = Math.min(asked.length ?? object.size - start, object.size - start);
  headers.set('Content-Range', `bytes ${start}-${start + length - 1}/${object.size}`);
  headers.set('Content-Length', String(length));
  return reply(206, headers, object.body);
}

function unsatisfiable(headers: Headers, size: number | undefined): Response {
  if (size !== undefined) headers.set('Content-Range', `bytes */${size}`);
  return reply(416, headers);
}

/** The range made definite and no longer than MAX_READ, or 'too-big'. */
export function bounded(range: TileRange, size: number | undefined): TileRange | 'too-big' {
  if (range.suffix !== undefined) return range.suffix > MAX_READ ? 'too-big' : range;
  const offset = range.offset ?? 0;
  const length = range.length ?? (size === undefined ? Infinity : Math.max(0, size - offset));
  return length > MAX_READ ? 'too-big' : { offset, length: Math.max(1, length) };
}

export default {
  fetch: serve,
};
