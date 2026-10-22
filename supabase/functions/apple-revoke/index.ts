/**
 * apple-revoke: revokes the Apple tokens queued when an Apple identity was
 * deleted, with an account or by unlinking (20261022160000). The rules are in
 * handler.ts.
 *
 * Called through pg_net by private.apple_revoke_send, after a deletion and
 * once a day while anything waits, with an empty body: it reads the queue
 * itself, so no token travels in the call. verify_jwt is off in config.toml
 * (the database has no JWT). Anybody may call it; the most that does is
 * revoke tokens already queued to be revoked.
 *
 * Secrets: APPLE_TEAM_ID, APPLE_SIWA_KEY_ID, APPLE_SIWA_KEY_P8.
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 */

import {
  APPLE_REVOKE_URL,
  appleClientSecret,
  appleKeyFrom,
  postToApple,
} from '../_shared/apple.ts';
import { type Deps, type DueRow, revokeDue } from './handler.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const KEY = appleKeyFrom((name) => Deno.env.get(name));

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const serviceHeaders: Record<string, string> = {
  apikey: SERVICE_KEY,
  'Content-Type': 'application/json',
};
if (!SERVICE_KEY.startsWith('sb_')) serviceHeaders.Authorization = `Bearer ${SERVICE_KEY}`;

function rpc(name: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: serviceHeaders,
    body: JSON.stringify(body),
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply(405, { error: 'POST only' });
  const key = KEY;
  if (!key) {
    console.error('apple-revoke: APPLE_TEAM_ID, APPLE_SIWA_KEY_ID or APPLE_SIWA_KEY_P8 is not set');
    return reply(500, { error: 'not configured' });
  }
  const deps: Deps = {
    async due() {
      const response = await rpc('apple_revocations_due', {});
      if (!response.ok) {
        console.error('apple-revoke: apple_revocations_due failed', response.status);
        return null;
      }
      return (await response.json()) as DueRow[];
    },
    async revoke(client, token) {
      return postToApple(APPLE_REVOKE_URL, {
        client_id: client,
        client_secret: await appleClientSecret(key, client),
        token,
        token_type_hint: 'refresh_token',
      });
    },
    async done(id, error) {
      const response = await rpc('apple_revocation_done', { p_id: id, p_error: error });
      if (!response.ok)
        console.error('apple-revoke: apple_revocation_done failed', response.status);
    },
    log: (message) => {
      console.error(message);
    },
  };
  const result = await revokeDue(deps);
  return reply(result.status, result.body);
});
