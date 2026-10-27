// @vitest-environment node
import { describe, expect, it } from 'vitest';
import worker, {
  type Env,
  etagListed,
  MAX_READ,
  parseRange,
  type TileObjectBody,
  type TileRange,
  type TilesBucket,
} from './index';

const ETAG = '"abc123"';
/** The real California archive's size: 631 MB. */
const BIG = 630_838_596;
const byteAt = (i: number) => i % 251;

/**
 * R2 as the Worker sees it: a 100-byte ca archive, and a us archive the size
 * of the real ca one, whose bytes are made only when read.
 */
function fakeBucket(): TilesBucket & { gets: number; read: number } {
  const sizes: Record<string, number> = {
    'ca-20261025.pmtiles': 100,
    'us-20261025.pmtiles': BIG,
    'usa-20261025.pmtiles': 100,
  };
  return {
    gets: 0,
    read: 0,
    head(key) {
      const size = sizes[key];
      return Promise.resolve(size === undefined ? null : { size, httpEtag: ETAG });
    },
    get(key, options) {
      this.gets++;
      const size = sizes[key];
      if (size === undefined) return Promise.resolve(null);
      const range: TileRange = options?.range ?? { offset: 0 };
      const start = range.suffix !== undefined ? size - range.suffix : (range.offset ?? 0);
      if (start >= size) return Promise.reject(new Error('InvalidRange'));
      const end = Math.min(size, range.length === undefined ? size : start + range.length);
      this.read += end - start;
      const bytes = Uint8Array.from({ length: end - start }, (_, i) => byteAt(start + i));
      const body: TileObjectBody = {
        size,
        httpEtag: ETAG,
        body: new Response(bytes).body ?? new ReadableStream(),
      };
      return Promise.resolve(body);
    },
  };
}

const BASE = 'https://sciclub-tiles.example.workers.dev';

async function ask(path: string, init: RequestInit = {}, env: Partial<Env> = {}) {
  const bucket = fakeBucket();
  const response = await worker.fetch(new Request(`${BASE}${path}`, init), {
    TILES: bucket,
    ...env,
  });
  return { response, bucket };
}

const fromClub = { Origin: 'https://thesciclub.com' };

describe('the tiles Worker', () => {
  it('serves a range as 206 with Content-Range', async () => {
    const { response } = await ask('/ca-20261025.pmtiles', {
      headers: { ...fromClub, Range: 'bytes=10-19' },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 10-19/100');
    expect(response.headers.get('Content-Length')).toBe('10');
    expect(response.headers.get('ETag')).toBe(ETAG);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual(
      Array.from({ length: 10 }, (_, i) => i + 10),
    );
  });

  it('serves the whole-US archive as well as the two before it', async () => {
    for (const path of ['/usa-20261025.pmtiles', '/us-20261025.pmtiles', '/ca-20261025.pmtiles']) {
      const { response } = await ask(path, { headers: { ...fromClub, Range: 'bytes=0-1' } });
      expect(response.status, path).toBe(206);
    }
  });

  it('serves a suffix and an open range', async () => {
    const suffix = await ask('/ca-20261025.pmtiles', { headers: { Range: 'bytes=-5' } });
    expect(suffix.response.headers.get('Content-Range')).toBe('bytes 95-99/100');
    const open = await ask('/ca-20261025.pmtiles', { headers: { Range: 'bytes=90-' } });
    expect(open.response.headers.get('Content-Range')).toBe('bytes 90-99/100');
    expect((await open.response.arrayBuffer()).byteLength).toBe(10);
  });

  it('refuses a range past the end, or several ranges, with 416', async () => {
    const past = await ask('/ca-20261025.pmtiles', { headers: { Range: 'bytes=500-600' } });
    expect(past.response.status).toBe(416);
    expect(past.response.headers.get('Content-Range')).toBe('bytes */100');
    const several = await ask('/ca-20261025.pmtiles', { headers: { Range: 'bytes=0-1,5-6' } });
    expect(several.response.status).toBe(416);
  });

  it('refuses a GET without a range, but answers HEAD', async () => {
    const { response, bucket } = await ask('/ca-20261025.pmtiles', { headers: fromClub });
    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://thesciclub.com');
    expect(bucket.gets).toBe(0);
  });

  it('answers HEAD with the size and no body', async () => {
    const { response, bucket } = await ask('/ca-20261025.pmtiles', { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Length')).toBe('100');
    expect(response.headers.get('ETag')).toBe(ETAG);
    expect(bucket.gets).toBe(0);
  });

  it('serves nothing but the built archives', async () => {
    for (const path of [
      '/secret.txt',
      '/ca-latest.pmtiles',
      '/ca-20261025.pmtiles/x',
      '/tiles/ca-20261025.pmtiles',
      '/xx-20261025.pmtiles',
      '/us-20260101.pmtiles', // well named, but not in the bucket
    ]) {
      const { response } = await ask(path, { headers: { ...fromClub, Range: 'bytes=0-1' } });
      expect(response.status, path).toBe(404);
      expect(response.headers.get('Cache-Control'), path).toBe('no-store');
    }
  });

  it('refuses other methods', async () => {
    const { response } = await ask('/ca-20261025.pmtiles', { method: 'PUT', body: 'x' });
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, HEAD, OPTIONS');
  });

  it('honours If-Match and If-None-Match on the ETag', async () => {
    const stale = await ask('/ca-20261025.pmtiles', {
      headers: { Range: 'bytes=0-9', 'If-Match': '"old"' },
    });
    expect(stale.response.status).toBe(412);
    const same = await ask('/ca-20261025.pmtiles', {
      headers: { Range: 'bytes=0-9', 'If-Match': ETAG },
    });
    expect(same.response.status).toBe(206);
    const cached = await ask('/ca-20261025.pmtiles', {
      headers: { Range: 'bytes=0-9', 'If-None-Match': ETAG },
    });
    expect(cached.response.status).toBe(304);
    expect(cached.response.headers.get('ETag')).toBe(ETAG);
  });

  it("names the club's origins, and only them, for CORS", async () => {
    for (const origin of ['https://thesciclub.com', 'capacitor://localhost', 'https://localhost']) {
      const { response } = await ask('/ca-20261025.pmtiles', {
        headers: { Origin: origin, Range: 'bytes=0-1' },
      });
      expect(response.headers.get('Access-Control-Allow-Origin'), origin).toBe(origin);
      expect(response.headers.get('Access-Control-Expose-Headers')).toBe(
        'Content-Range, Content-Length, ETag',
      );
      expect(response.headers.get('Vary')).toBe('Origin');
    }
    const other = await ask('/ca-20261025.pmtiles', {
      headers: { Origin: 'https://evil.example', Range: 'bytes=0-1' },
    });
    expect(other.response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(other.response.headers.get('Vary')).toBe('Origin');
  });

  it('allows a development origin only when one is set', async () => {
    const init = { headers: { Origin: 'http://localhost:5173', Range: 'bytes=0-1' } };
    const without = await ask('/ca-20261025.pmtiles', init);
    expect(without.response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const withDev = await ask('/ca-20261025.pmtiles', init, {
      DEV_ORIGIN: 'http://localhost:5173',
    });
    expect(withDev.response.headers.get('Access-Control-Allow-Origin')).toBe(
      'http://localhost:5173',
    );
  });

  it('answers a preflight from the club, and refuses one from elsewhere', async () => {
    const preflight = {
      method: 'OPTIONS',
      headers: {
        Origin: 'capacitor://localhost',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'range',
      },
    };
    const { response } = await ask('/ca-20261025.pmtiles', preflight);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('capacitor://localhost');
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, HEAD');
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Range, If-Match');
    const other = await ask('/ca-20261025.pmtiles', {
      ...preflight,
      headers: { ...preflight.headers, Origin: 'https://evil.example' },
    });
    expect(other.response.status).toBe(403);
    expect(other.response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('no reading the archive whole', () => {
  const big = '/us-20261025.pmtiles';
  const asking = (range: string) => ({ headers: { ...fromClub, Range: range } });

  it("serves pmtiles' own reads", async () => {
    // Header and root, a leaf directory, and the 2026-10-25 build's largest tile.
    for (const [range, length] of [
      ['bytes=0-16383', 16384],
      ['bytes=1627-10899', 9273],
      ['bytes=15070649-15365539', 294891],
    ] as const) {
      const { response } = await ask(big, asking(range));
      expect(response.status, range).toBe(206);
      expect(response.headers.get('Content-Length'), range).toBe(String(length));
      expect((await response.arrayBuffer()).byteLength, range).toBe(length);
    }
  });

  it('refuses more than MAX_READ in one request, however it is asked', async () => {
    for (const range of [
      'bytes=0-',
      'bytes=1-',
      `bytes=${BIG - MAX_READ - 1}-`,
      'bytes=-999999999999',
      `bytes=-${MAX_READ + 1}`,
      'bytes=1-99999999999999999999',
      `bytes=0-${MAX_READ}`,
    ]) {
      const { response, bucket } = await ask(big, asking(range));
      expect(response.status, range).toBe(400);
      expect(response.headers.get('Cache-Control'), range).toBe('no-store');
      expect(response.headers.get('Access-Control-Allow-Origin'), range).toBe(
        'https://thesciclub.com',
      );
      expect(bucket.read, range).toBe(0);
    }
  });

  it('serves up to MAX_READ, open-ended or from the end', async () => {
    for (const range of [
      `bytes=0-${MAX_READ - 1}`,
      `bytes=${BIG - MAX_READ}-`,
      `bytes=-${MAX_READ}`,
    ]) {
      const { response, bucket } = await ask(big, asking(range));
      expect(response.status, range).toBe(206);
      expect(response.headers.get('Content-Length'), range).toBe(String(MAX_READ));
      expect(bucket.read, range).toBe(MAX_READ);
    }
  });

  it('serves an open-ended or long range on a file smaller than the cap', async () => {
    for (const range of ['bytes=0-', 'bytes=0-16383']) {
      // The second is pmtiles' first read, on an archive smaller than it.
      const { response } = await ask('/ca-20261025.pmtiles', asking(range));
      expect(response.status, range).toBe(206);
      expect(response.headers.get('Content-Range'), range).toBe('bytes 0-99/100');
    }
  });
});

describe('conditions, in RFC 9110 order', () => {
  const range = { ...fromClub, Range: 'bytes=0-9' };

  it('ignores the dates, which it never sends', async () => {
    const future = new Date(Date.now() + 86_400_000).toUTCString();
    const { response } = await ask('/ca-20261025.pmtiles', {
      headers: { ...range, 'If-Match': ETAG, 'If-Modified-Since': future },
    });
    expect(response.status).toBe(206);
    const past = await ask('/ca-20261025.pmtiles', {
      headers: { ...range, 'If-Unmodified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT' },
    });
    expect(past.response.status).toBe(206);
  });

  it('checks If-Match before If-None-Match', async () => {
    const both = await ask('/ca-20261025.pmtiles', {
      headers: { ...range, 'If-Match': ETAG, 'If-None-Match': ETAG },
    });
    expect(both.response.status).toBe(304);
    const stale = await ask('/ca-20261025.pmtiles', {
      headers: { ...range, 'If-Match': '"old"', 'If-None-Match': ETAG },
    });
    expect(stale.response.status).toBe(412);
  });
});

describe('the rate limit', () => {
  const ranged = {
    headers: { ...fromClub, Range: 'bytes=0-9', 'CF-Connecting-IP': '203.0.113.7' },
  };

  it('answers 429 over the limit, keyed by address, CORS kept', async () => {
    const keys: string[] = [];
    const LIMITER = {
      limit: ({ key }: { key: string }) => {
        keys.push(key);
        return Promise.resolve({ success: false });
      },
    };
    const { response, bucket } = await ask('/ca-20261025.pmtiles', ranged, { LIMITER });
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://thesciclub.com');
    expect(keys).toEqual(['203.0.113.7']);
    expect(bucket.gets).toBe(0);
  });

  it('serves under the limit', async () => {
    const LIMITER = { limit: () => Promise.resolve({ success: true }) };
    const { response } = await ask('/ca-20261025.pmtiles', ranged, { LIMITER });
    expect(response.status).toBe(206);
  });

  it('lets requests through when the limiter fails or is missing', async () => {
    const LIMITER = { limit: () => Promise.reject(new Error('limiter down')) };
    expect((await ask('/ca-20261025.pmtiles', ranged, { LIMITER })).response.status).toBe(206);
    expect((await ask('/ca-20261025.pmtiles', ranged)).response.status).toBe(206);
  });

  it('never counts a preflight', async () => {
    let calls = 0;
    const LIMITER = {
      limit: () => {
        calls++;
        return Promise.resolve({ success: false });
      },
    };
    const preflight = {
      method: 'OPTIONS',
      headers: { Origin: 'https://thesciclub.com', 'Access-Control-Request-Method': 'GET' },
    };
    expect((await ask('/ca-20261025.pmtiles', preflight, { LIMITER })).response.status).toBe(204);
    expect(calls).toBe(0);
  });
});

describe('etagListed', () => {
  it('matches a list, a weak tag and *', () => {
    expect(etagListed(`"x", ${ETAG}`, ETAG)).toBe(true);
    expect(etagListed(`W/${ETAG}`, ETAG)).toBe(true);
    expect(etagListed('*', ETAG)).toBe(true);
    expect(etagListed('"x"', ETAG)).toBe(false);
  });
});

describe('parseRange', () => {
  it('reads one range and refuses the rest', () => {
    expect(parseRange(null)).toBeUndefined();
    expect(parseRange('bytes=0-16383')).toEqual({ offset: 0, length: 16384 });
    expect(parseRange('bytes=5-')).toEqual({ offset: 5 });
    expect(parseRange('bytes=-5')).toEqual({ suffix: 5 });
    for (const bad of ['bytes=9-1', 'bytes=-', 'bytes=-0', 'items=0-1', 'bytes=0-1,3-4']) {
      expect(parseRange(bad), bad).toBe('bad');
    }
  });
});
