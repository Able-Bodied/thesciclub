/**
 * home-screen-handoff: signs the iPhone Home Screen app in with the Safari
 * sign-in it was added from (the owner, 2026-10-11; 20261012100000).
 *
 * `POST { code }`, with no session: the app has none yet, which is the point.
 * The code is the single-use one a signed-in Safari tab left in a cookie, which
 * iOS copied into the app when it was added. Redeeming it answers the account's
 * address; Auth's admin generate_link then makes a one-time sign-in for it,
 * and the app exchanges its hash for a session of its own (verifyOtp). Nothing
 * is emailed. The rules are in handler.ts.
 *
 * `POST { pairing }` is the other way in (the owner, 2026-10-14;
 * 20261015010000): the secret the app kept when it sent the member to Chrome or
 * Safari for Google, collecting the sign-in that browser left for it.
 *
 * verify_jwt is off in config.toml: the caller has no JWT to verify.
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 */

import { handOff } from './handler.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const serviceHeaders: Record<string, string> = {
  apikey: SERVICE_KEY,
  'Content-Type': 'application/json',
};
if (!SERVICE_KEY.startsWith('sb_')) serviceHeaders.Authorization = `Bearer ${SERVICE_KEY}`;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return reply(405, { error: 'POST only' });
  const payload: unknown = await request.json().catch(() => null);
  const result = await handOff(payload, {
    async redeem(code) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/redeem_home_screen_handoff`, {
        method: 'POST',
        headers: serviceHeaders,
        body: JSON.stringify({ code }),
      });
      if (!response.ok) {
        console.error('home-screen-handoff: redeem failed', response.status);
        return null;
      }
      const email: unknown = await response.json();
      return typeof email === 'string' && email !== '' ? email : null;
    },
    async redeemPairing(secret) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/redeem_home_screen_pairing`, {
        method: 'POST',
        headers: serviceHeaders,
        body: JSON.stringify({ secret }),
      });
      if (!response.ok) {
        console.error('home-screen-handoff: redeem pairing failed', response.status);
        return null;
      }
      const email: unknown = await response.json();
      return typeof email === 'string' && email !== '' ? email : null;
    },
    async signInHash(email) {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers: serviceHeaders,
        body: JSON.stringify({ type: 'magiclink', email }),
      });
      if (!response.ok) {
        console.error('home-screen-handoff: generate_link failed', response.status);
        return null;
      }
      const link = (await response.json()) as {
        hashed_token?: string;
        properties?: { hashed_token?: string };
      };
      return link.hashed_token ?? link.properties?.hashed_token ?? null;
    },
  });
  return reply(result.status, result.body);
});
