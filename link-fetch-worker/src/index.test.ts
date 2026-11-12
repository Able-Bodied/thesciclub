// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index';

const env = { FETCH_SECRET: 'live-secret', FETCH_SECRET_TEST: 'test-secret' };
const ask = (body: unknown, secret = 'test-secret') =>
  worker.fetch(
    new Request('https://sciclub-link-fetch.example/', {
      method: 'POST',
      headers: { 'x-fetch-secret': secret },
      body: JSON.stringify(body),
    }),
    env,
  );

afterEach(() => vi.unstubAllGlobals());

// It must not become an open proxy: only link-preview's secret, only a public
// name on the usual ports, and never a redirect followed on its own.
describe('the link-fetch Worker', () => {
  it('fetches only for link-preview, only names, and hands redirects back', async () => {
    const upstream = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(
        new Response(null, { status: 301, headers: { location: 'http://10.0.0.1/' } }),
      ),
    );
    vi.stubGlobal('fetch', upstream);
    const page = { url: 'https://example.org/a', accept: 'text/html,application/xhtml+xml' };

    expect((await ask(page, 'guess')).status).toBe(403);
    expect((await ask(page, '')).status).toBe(403);
    for (const url of [
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]/',
      'http://0x7f.1/',
      'http://localhost/',
      'https://example.org:8443/',
      'https://user:pass@example.org/',
      'file:///etc/passwd',
    ]) {
      expect((await ask({ ...page, url })).status, url).toBe(400);
    }
    expect((await ask({ ...page, accept: '*/*' })).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();

    const moved = await ask(page);
    expect(moved.status).toBe(200);
    expect(moved.headers.get('x-upstream-status')).toBe('301');
    expect(moved.headers.get('x-upstream-location')).toBe('http://10.0.0.1/');
    expect(upstream).toHaveBeenCalledOnce();
    expect(upstream.mock.calls[0]).toMatchObject(['https://example.org/a', { redirect: 'manual' }]);
  });
});
