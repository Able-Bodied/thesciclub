/**
 * apple-notifications: Sign in with Apple's server-to-server notifications
 * (consent-revoked, account-delete, email-disabled, email-enabled). The rules
 * are in handler.ts; what is kept, in 20261022170000.
 *
 * Its URL goes in the Apple Developer portal: Identifiers → the primary App
 * ID → Sign In with Apple → Server-to-Server Notification Endpoint.
 * verify_jwt is off in config.toml: Apple sends no Supabase JWT, and its own
 * signature is what is checked.
 *
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 */

import { APPLE_KEYS_URL } from '../_shared/apple.ts';
import { type AppleJwk, type Deps, receiveNotification } from './handler.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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

let cached: { at: number; keys: AppleJwk[] } | null = null;
const KEYS_FOR_MS = 60 * 60_000;

const deps: Deps = {
  async keys(fresh) {
    if (!fresh && cached && Date.now() - cached.at < KEYS_FOR_MS) return cached.keys;
    const response = await fetch(APPLE_KEYS_URL);
    if (!response.ok) return cached?.keys ?? [];
    const keys = ((await response.json()) as { keys?: AppleJwk[] }).keys ?? [];
    cached = { at: Date.now(), keys };
    return keys;
  },
  async record(sub, kind, email) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/apple_notification_record`, {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify({ p_sub: sub, p_kind: kind, p_email: email }),
    });
    if (!response.ok) {
      console.error('apple-notifications: apple_notification_record failed', response.status);
      return null;
    }
    return ((await response.json()) as unknown) === true;
  },
  nowSeconds: () => Math.floor(Date.now() / 1000),
  log: (message) => {
    console.log(message);
  },
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply(405, { error: 'POST only' });
  const payload: unknown = await request.json().catch(() => null);
  const result = await receiveNotification(payload, deps);
  return reply(result.status, result.body);
});
