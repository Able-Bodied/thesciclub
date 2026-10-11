/**
 * send-invite: emails an invite its one-time link, through Resend.
 *
 * `POST { invite_id }` with the caller's JWT. The caller must be the member
 * who made the invite, or an administrator, and the invite must be pending.
 * Each send makes a new token, so the older link stops working. Only the
 * token's sha256 is stored (`invites.token_hash`); the token exists in the
 * email and nowhere else.
 *
 * A client cannot write `token_hash` or `sent_at`, so after checking the
 * caller this uses the service role. The rules are in handler.ts.
 *
 * Secrets (`pnpm exec supabase secrets set`): RESEND_API_KEY and INVITE_FROM
 * (`The SCI Club <invites@thesciclub.com>`), and optionally SITE_URL.
 * SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided
 * by the platform.
 */

import { SITE_URL } from './compose.ts';
import { type Deps, type InviteRow, sendInvite } from './handler.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const INVITE_FROM = Deno.env.get('INVITE_FROM') ?? '';
const SITE = Deno.env.get('SITE_URL') ?? SITE_URL;

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

async function rest<T>(path: string): Promise<T | null> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: serviceHeaders });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

const deps: Deps = {
  async callerId(jwt) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}` },
    });
    if (!response.ok) return null;
    return ((await response.json()) as { id?: string }).id ?? null;
  },
  async isAdmin(memberId) {
    const rows = await rest<unknown[]>(
      `members?select=id&id=eq.${memberId}&is_admin=eq.true&status=eq.active`,
    );
    return (rows?.length ?? 0) > 0;
  },
  async loadInvite(id) {
    const rows = await rest<InviteRow[]>(
      `invites?select=id,email,status,sent_at,invited_by_member_id,invited_by_organization_id&id=eq.${id}`,
    );
    return rows?.[0] ?? null;
  },
  async inviterName(invite) {
    if (invite.invited_by_organization_id) {
      const rows = await rest<{ name: string }[]>(
        `organizations?select=name&id=eq.${invite.invited_by_organization_id}`,
      );
      return rows?.[0]?.name ?? '';
    }
    if (invite.invited_by_member_id) {
      const rows = await rest<{ display_name: string }[]>(
        `members?select=display_name&id=eq.${invite.invited_by_member_id}`,
      );
      return rows?.[0]?.display_name ?? '';
    }
    return '';
  },
  async saveTokenHash(id, hash) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/invites?id=eq.${id}&status=eq.pending`, {
      method: 'PATCH',
      headers: { ...serviceHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({ token_hash: hash }),
    });
    if (!response.ok) return false;
    return ((await response.json()) as unknown[]).length > 0;
  },
  async markSent(id, at) {
    await fetch(`${SUPABASE_URL}/rest/v1/invites?id=eq.${id}`, {
      method: 'PATCH',
      headers: serviceHeaders,
      body: JSON.stringify({ sent_at: at }),
    });
  },
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
    if (!response.ok) console.error('send-invite: Resend refused', response.status);
    return response.ok;
  },
  now: () => new Date(),
  newToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');
  },
  siteUrl: SITE,
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return reply(405, { error: 'POST only' });
  if (!RESEND_API_KEY || !INVITE_FROM) {
    console.error('send-invite: RESEND_API_KEY or INVITE_FROM is not set');
    return reply(500, { error: 'not configured' });
  }
  const payload = await request.json().catch(() => null);
  const result = await sendInvite(request.headers.get('Authorization'), payload, deps);
  return reply(result.status, result.body);
});
