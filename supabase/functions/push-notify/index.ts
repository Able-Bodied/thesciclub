/**
 * push-notify: the sender. Piece 4 of notifications (HANDOFF.md).
 *
 * Called through pg_net by `push_notify_send` — from the triggers, and from
 * the daily cron — with `{ event, key }`: what happened and which row. It asks
 * the database who is owed a notification and what it may say (`push_owed`),
 * words each one
 * (compose.ts), encrypts and signs it (webpush.ts) and sends it. A push
 * service that answers 404 or 410 has forgotten the phone, so the club
 * forgets it too (`push_forget`) — otherwise the table fills with phones that
 * were wiped.
 *
 * Deployed with `verify_jwt = false` (supabase/config.toml): the caller is
 * the database, not a member, and carries the vault's `push_notify_secret`
 * instead of a JWT. This function never holds that secret; it passes on what
 * it was sent and the database says yes or no. So the public URL can be
 * called by anybody and does nothing for them.
 *
 * Secrets (`pnpm exec supabase secrets set`): VAPID_PUBLIC_KEY,
 * VAPID_PRIVATE_KEY, and optionally VAPID_SUBJECT. SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 */

import { compose, type Owed } from './compose.ts';
import { sendPush } from './webpush.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VAPID = {
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
};
// How a push service reaches us about abuse. A site URL rather than
// somebody's inbox.
const SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'https://thesciclub.netlify.app';

const EVENTS = new Set([
  'message',
  'post',
  'like',
  'group_add',
  'report',
  'member_joined',
  'daily',
]);

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A PostgREST rpc as the service role. A new-format key goes as `apikey` only. */
function rpc(name: string, args: Record<string, unknown>): Promise<Response> {
  const headers: Record<string, string> = {
    apikey: SERVICE_KEY,
    'Content-Type': 'application/json',
  };
  if (!SERVICE_KEY.startsWith('sb_')) headers.Authorization = `Bearer ${SERVICE_KEY}`;
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply(405, { error: 'POST only' });
  if (!VAPID.publicKey || !VAPID.privateKey) {
    console.error('push-notify: VAPID keys are not set');
    return reply(500, { error: 'not configured' });
  }

  const secret = request.headers.get('x-notify-secret') ?? '';
  let event: unknown;
  let key: unknown;
  try {
    ({ event, key } = (await request.json()) as { event?: unknown; key?: unknown });
  } catch {
    return reply(400, { error: 'not JSON' });
  }
  // The key's contents are the database's to check; it casts what it reads.
  if (typeof event !== 'string' || !EVENTS.has(event) || typeof key !== 'object' || key === null) {
    return reply(400, { error: 'expected { event, key }' });
  }

  const owedResponse = await rpc('push_owed', { p_secret: secret, p_event: event, p_key: key });
  if (!owedResponse.ok) {
    // A wrong secret is 42501, which PostgREST answers with 401 or 403.
    const text = await owedResponse.text();
    if (owedResponse.status === 401 || owedResponse.status === 403) {
      return reply(401, { error: 'not the trigger' });
    }
    console.error('push-notify: push_owed failed', owedResponse.status, text);
    return reply(502, { error: 'could not read who is owed' });
  }
  const owed = (await owedResponse.json()) as Owed[];

  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    owed.map(async (row) => {
      const message = compose(row);
      if (!message) return;
      try {
        const status = await sendPush(row, JSON.stringify(message), VAPID, SUBJECT);
        if (status === 404 || status === 410) {
          // Worth a line: a device forgotten by mistake is a member who
          // silently stops being told anything.
          console.log(
            'push-notify: forgetting a device the push service called gone',
            status,
            new URL(row.endpoint).host,
          );
          gone.push(row.endpoint);
        } else if (status >= 400) {
          // The endpoint's host names the service; the path is the device.
          console.error('push-notify: push service said', status, new URL(row.endpoint).host);
        } else sent++;
      } catch (e) {
        console.error('push-notify: send failed', new URL(row.endpoint).host, e);
      }
    }),
  );

  if (gone.length > 0) {
    const forgot = await rpc('push_forget', { p_secret: secret, p_endpoints: gone });
    if (!forgot.ok)
      console.error('push-notify: push_forget failed', forgot.status, await forgot.text());
  }

  return reply(200, { owed: owed.length, sent, forgotten: gone.length });
});
