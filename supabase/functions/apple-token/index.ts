/**
 * apple-token: keeps an Apple refresh token so the account's Sign in with
 * Apple can be revoked when it is deleted (20261022160000). The rules are in
 * handler.ts.
 *
 * `POST { code }` or `POST { refresh_token }`, with the member's JWT
 * (verify_jwt stays on).
 *
 * Secrets (`pnpm exec supabase secrets set`): APPLE_TEAM_ID,
 * APPLE_SIWA_KEY_ID, APPLE_SIWA_KEY_P8. SUPABASE_URL, SUPABASE_ANON_KEY and
 * SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 */

import {
  APPLE_TOKEN_URL,
  type AppleClient,
  appleClientSecret,
  appleKeyFrom,
  postToApple,
} from '../_shared/apple.ts';
import { type Deps, keepAppleToken } from './handler.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const KEY = appleKeyFrom((name) => Deno.env.get(name));

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

interface AuthUser {
  id?: string;
  identities?: { provider?: string; id?: string; identity_data?: { sub?: unknown } }[];
}

const deps: Deps = {
  async caller(jwt) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}` },
    });
    if (!response.ok) return null;
    const user = (await response.json()) as AuthUser;
    if (!user.id) return null;
    const appleSubs = (user.identities ?? [])
      .filter((i) => i.provider === 'apple')
      .map((i) => (typeof i.identity_data?.sub === 'string' ? i.identity_data.sub : i.id))
      .filter((sub): sub is string => typeof sub === 'string');
    return { id: user.id, appleSubs };
  },
  async askApple(client: AppleClient, form) {
    if (!KEY) return { status: 0, body: { error: 'not configured' } };
    return postToApple(APPLE_TOKEN_URL, {
      ...form,
      client_id: client,
      client_secret: await appleClientSecret(KEY, client),
    });
  },
  async keep(userId, sub, client, refreshToken) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/apple_token_keep`, {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify({
        p_user: userId,
        p_sub: sub,
        p_client_id: client,
        p_refresh_token: refreshToken,
      }),
    });
    return response.ok && ((await response.json()) as unknown) === true;
  },
  log: (message) => {
    console.error(message);
  },
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return reply(405, { error: 'POST only' });
  if (!KEY) {
    console.error('apple-token: APPLE_TEAM_ID, APPLE_SIWA_KEY_ID or APPLE_SIWA_KEY_P8 is not set');
    return reply(500, { error: 'not configured' });
  }
  const payload: unknown = await request.json().catch(() => null);
  const result = await keepAppleToken(request.headers.get('Authorization'), payload, deps);
  return reply(result.status, result.body);
});
