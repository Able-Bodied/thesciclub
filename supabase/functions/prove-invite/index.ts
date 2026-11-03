/**
 * prove-invite: lets somebody signed in at one address prove an invite that
 * went to another (the owner, 2026-11-02; 20261102040000).
 *
 * `POST { email }` with the caller's JWT emails that address a code, if it has
 * an invite. The answer is the same if it has none. `POST { code }` claims the
 * invite for the caller, answering `{ proved }`. The rules are in handler.ts.
 *
 * Secrets, shared with send-invite: RESEND_API_KEY and INVITE_FROM. SUPABASE_URL,
 * SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 */

import { type Deps, proveInvite } from './handler.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const INVITE_FROM = Deno.env.get('INVITE_FROM') ?? '';

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

async function rpc(name: string, body: Record<string, unknown>): Promise<boolean> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: serviceHeaders,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    console.error(`prove-invite: ${name} failed`, response.status);
    return false;
  }
  return (await response.json()) === true;
}

const deps: Deps = {
  async callerId(jwt) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}` },
    });
    if (!response.ok) return null;
    return ((await response.json()) as { id?: string }).id ?? null;
  },
  start: (account, email, codeHash) =>
    rpc('start_invite_proof', { p_account: account, p_email: email, p_code_hash: codeHash }),
  finish: (account, codeHash) =>
    rpc('finish_invite_proof', { p_account: account, p_code_hash: codeHash }),
  async sendEmail(to, email) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: INVITE_FROM,
        to: [to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
    });
    if (!response.ok) console.error('prove-invite: Resend refused', response.status);
    return response.ok;
  },
  newCode() {
    const [value = 0] = crypto.getRandomValues(new Uint32Array(1));
    return String(value % 1_000_000).padStart(6, '0');
  },
  now: () => Date.now(),
  wait: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return reply(405, { error: 'POST only' });
  if (!RESEND_API_KEY || !INVITE_FROM) {
    console.error('prove-invite: RESEND_API_KEY or INVITE_FROM is not set');
    return reply(500, { error: 'not configured' });
  }
  const payload: unknown = await request.json().catch(() => null);
  const result = await proveInvite(request.headers.get('Authorization'), payload, deps);
  return reply(result.status, result.body);
});
