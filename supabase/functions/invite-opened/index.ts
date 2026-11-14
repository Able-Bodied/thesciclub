/**
 * invite-opened: the 1x1 picture in an invite email (20261114030000). When a
 * mail app loads it, the invite is marked opened (invites.opened_at), for the
 * administrator's "How the invites did". `GET ?k=<invites.open_key>`; it
 * always answers with the picture, whatever the key.
 *
 * A guess, said so on the page: some mail apps load every picture by
 * themselves, some never load any.
 *
 * No JWT: a mail app has none (config.toml). The key names one invite and
 * can do nothing but mark it opened.
 */

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A transparent GIF, 1x1.
const PIXEL = Uint8Array.from(
  atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
  (c) => c.charCodeAt(0),
);

const headers: Record<string, string> = { apikey: SERVICE_KEY, 'Content-Type': 'application/json' };
if (!SERVICE_KEY.startsWith('sb_')) headers.Authorization = `Bearer ${SERVICE_KEY}`;

Deno.serve(async (request) => {
  const key = new URL(request.url).searchParams.get('k') ?? '';
  if (request.method === 'GET' && UUID.test(key)) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/invite_opened`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_key: key }),
      });
    } catch (e) {
      console.error('invite-opened: not marked', e);
    }
  }
  return new Response(PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
});
