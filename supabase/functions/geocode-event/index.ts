/**
 * geocode-event: places an event or an organization's place at its address,
 * once added or changed (20261025030000). The rules are in handler.ts.
 *
 * Called through pg_net by private.geocode_send, after an address changes,
 * with an empty body: it reads the queue itself. verify_jwt is
 * off in config.toml (the database has no JWT). Instead the call carries the
 * vault's geocode_event_secret as x-geocode-secret; like apple-revoke, this
 * function never holds it, and geocodes_due says yes or no (401
 * otherwise).
 *
 * No secrets of its own. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
 * provided by the platform.
 */

import { lookUpPlace } from '../_shared/nominatim.ts';
import { type Deps, type DueRow, geocodeDue } from './handler.ts';

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

function rpc(name: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: serviceHeaders,
    body: JSON.stringify(body),
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply(405, { error: 'POST only' });
  const secret = request.headers.get('x-geocode-secret');
  if (!secret) return reply(401, { error: 'not the database' });
  const deps: Deps = {
    async due(given) {
      const response = await rpc('geocodes_due', { p_secret: given });
      // A wrong secret is 42501, which PostgREST answers with 401 or 403.
      if (response.status === 401 || response.status === 403) return 'refused';
      if (!response.ok) {
        console.error('geocode-event: geocodes_due failed', response.status);
        return null;
      }
      return (await response.json()) as DueRow[];
    },
    lookup: (query) => lookUpPlace(query),
    async done(row, place, error) {
      const response = await rpc('geocode_done', {
        p_kind: row.kind,
        p_target: row.target_id,
        p_query: row.query,
        p_latitude: place?.latitude ?? null,
        p_longitude: place?.longitude ?? null,
        p_precision: place?.precision ?? null,
        p_error: error,
      });
      if (!response.ok) console.error('geocode-event: geocode_done failed', response.status);
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    log: (message) => {
      console.error(message);
    },
  };
  const result = await geocodeDue(secret, deps);
  return reply(result.status, result.body);
});
