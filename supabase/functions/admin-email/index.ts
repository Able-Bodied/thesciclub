/**
 * admin-email: what an email in Admin › Sent said (the owner, 2026-11-23). The club keeps no
 * email's words; Resend does, for as long as the plan keeps them. Given a delivery_log row,
 * this asks the database for its Resend id as the caller (admin_email_message_id refuses
 * anyone but an administrator, 20261123150000), fetches the email from Resend, and returns
 * its subject, sender, time and words with the sign-in codes and one-time links hidden
 * (hide.ts). Never the address it went to.
 *
 * Secret: RESEND_API_KEY, which must be a full-access key to read emails; RESEND_READ_KEY,
 * if set, is used instead (a sending-only key cannot read).
 */
import { framedHtml, hideSecrets } from './hide.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const RESEND_KEY = Deno.env.get('RESEND_READ_KEY') ?? Deno.env.get('RESEND_API_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function answer(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'POST') return answer(405, { error: 'POST only' });
  const authorization = request.headers.get('Authorization') ?? '';
  let id: unknown;
  try {
    ({ id } = (await request.json()) as { id?: unknown });
  } catch {
    return answer(400, { error: 'Which email?' });
  }
  if (typeof id !== 'number' || !Number.isInteger(id))
    return answer(400, { error: 'Which email?' });

  const lookup = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_email_message_id`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_id: id }),
  });
  if (!lookup.ok) return answer(403, { error: 'Only administrators read what was sent.' });
  const messageId = (await lookup.json()) as string | null;
  if (!messageId) return answer(404, { error: 'Resend gave no id for this email.' });

  if (!RESEND_KEY) return answer(500, { error: 'RESEND_API_KEY is not set.' });
  const email = await fetch(`https://api.resend.com/emails/${encodeURIComponent(messageId)}`, {
    headers: { Authorization: `Bearer ${RESEND_KEY}` },
  });
  if (email.status === 401 || email.status === 403) {
    return answer(502, {
      error:
        'The Resend key can only send, not read. Make a full-access key in Resend and set it as RESEND_READ_KEY.',
    });
  }
  if (email.status === 404) {
    return answer(404, {
      error: 'Resend no longer has this email: it keeps them for a limited time.',
    });
  }
  if (!email.ok) return answer(502, { error: `Resend answered ${String(email.status)}.` });
  const e = (await email.json()) as {
    subject?: string;
    from?: string;
    created_at?: string;
    html?: string | null;
    text?: string | null;
    last_event?: string;
  };
  return answer(200, {
    subject: e.subject ?? null,
    from: e.from ?? null,
    at: e.created_at ?? null,
    last_event: e.last_event ?? null,
    html: e.html ? framedHtml(e.html) : null,
    text: e.text ? hideSecrets(e.text) : null,
  });
});
