// @vitest-environment node
import { describe, expect, it } from 'vitest';
import worker, { BEACON, type Env, KIND, page, script } from './index';

const BASE = 'https://sciclub-count.example.workers.dev';
const TOKEN = 'ea21a9f0317846938ebd0abe64ea5aa6';

function ask(path: string, env: Env = { COUNT_TOKEN: TOKEN }, method = 'GET') {
  return worker.fetch(new Request(`${BASE}${path}`, { method }), env);
}

describe('the counting page', () => {
  it("loads Cloudflare's script with the token, following in-page moves", async () => {
    const response = ask('/events/:id');
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(`src="${BEACON}"`);
    expect(html).toContain(`data-cf-beacon='{"token":"${TOKEN}","spa":true}'`);
    expect(html).toContain('<script src="/count.js"></script>');
  });

  it('counts nothing without a token, or with one that is not a token', () => {
    expect(page('')).not.toContain(BEACON);
    expect(page(`x'><script>alert(1)</script>`)).not.toContain('alert');
  });

  it('may be framed by the club alone, and reaches only Cloudflare', () => {
    const csp = ask('/home').headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain('frame-ancestors https://thesciclub.com;');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain(`script-src 'self' ${BEACON};`);
    expect(csp).toContain('connect-src https://cloudflareinsights.com/cdn-cgi/rum;');
    expect(ask('/home').headers.get('Referrer-Policy')).toBe('no-referrer');
    const dev = ask('/home', { DEV_ORIGIN: 'http://localhost:4173' });
    expect(dev.headers.get('Content-Security-Policy')).toContain(
      'frame-ancestors https://thesciclub.com http://localhost:4173;',
    );
  });

  it('serves kinds of page only: no ids beyond the pattern, no files, no queries kept', () => {
    expect(ask('/favicon.ico').status).toBe(404);
    expect(ask('/a.b').status).toBe(404);
    expect(ask(`/${'x'.repeat(81)}`).status).toBe(404);
    expect(KIND.test('/events/:id/guests')).toBe(true);
    expect(KIND.test('/events/1?x=secret')).toBe(false);
  });

  it('answers only GET and HEAD', () => {
    expect(ask('/home', {}, 'POST').status).toBe(405);
    expect(ask('/home', {}, 'HEAD').status).toBe(200);
  });

  it('moves only on a kind of page from the club', () => {
    const code = script(['https://thesciclub.com']);
    expect(code).toContain('const FROM = ["https://thesciclub.com"];');
    expect(code).toContain('event.source !== parent');
    // The pattern survives being written into the script.
    const written = /const KIND = (.+);/.exec(code)?.[1] ?? '';
    expect(written).toBe(String(KIND));
  });
});
