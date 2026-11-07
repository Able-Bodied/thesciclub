/**
 * Cloudflare Web Analytics' counter, on an address of its own (the owner,
 * 2026-11-07). The club frames this page, hidden, and tells it only the kind
 * of page open: /events/:id, never which one (src/lib/web-analytics.ts).
 * Cloudflare's script runs here, another origin, where a member's session
 * cannot be read. Deployed by the owner: wrangler.toml.
 */

export interface Env {
  /** The Web Analytics site's token. Empty: the page counts nothing. */
  COUNT_TOKEN?: string;
  /** One more origin that may frame it, for local testing only. */
  DEV_ORIGIN?: string;
}

export const CLUB = 'https://thesciclub.com';
export const BEACON = 'https://static.cloudflareinsights.com/beacon.min.js';
const REPORTS = 'https://cloudflareinsights.com/cdn-cgi/rum';
/** A kind of page, as the club sends it: /events/:id. Nothing else is served. */
export const KIND = /^\/[A-Za-z0-9/:_-]{0,80}$/;
const TOKEN = /^[0-9a-f]{32}$/;

/** Follows the club's page: each kind it sends becomes this page's address. */
export function script(origins: string[]): string {
  return `"use strict";
const FROM = ${JSON.stringify(origins)};
const KIND = ${String(KIND)};
addEventListener("message", (event) => {
  if (event.source !== parent || !FROM.includes(event.origin)) return;
  const kind = event.data;
  if (typeof kind !== "string" || !KIND.test(kind) || kind === location.pathname) return;
  history.pushState(null, "", kind);
});
`;
}

/** The page; spa makes Cloudflare count each address the script moves to. */
export function page(token: string): string {
  const beacon = TOKEN.test(token)
    ? `<script defer src="${BEACON}" data-cf-beacon='${JSON.stringify({ token, spa: true })}'></script>`
    : '';
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>The Sci Club</title><script src="/count.js"></script>${beacon}</html>`;
}

export function policy(origins: string[]): string {
  return [
    "default-src 'none'",
    `script-src 'self' ${BEACON}`,
    `connect-src ${REPORTS}`,
    `frame-ancestors ${origins.join(' ')}`,
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

const COMMON = {
  'Cache-Control': 'public, max-age=600',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

export default {
  fetch(request: Request, env: Env): Response {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const origins = [CLUB, ...(env.DEV_ORIGIN ? [env.DEV_ORIGIN] : [])];
    const { pathname } = new URL(request.url);
    if (pathname === '/count.js') {
      return new Response(script(origins), {
        headers: { ...COMMON, 'Content-Type': 'text/javascript; charset=utf-8' },
      });
    }
    if (!KIND.test(pathname)) return new Response('Not found', { status: 404 });
    return new Response(page(env.COUNT_TOKEN ?? ''), {
      headers: {
        ...COMMON,
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': policy(origins),
      },
    });
  },
};
