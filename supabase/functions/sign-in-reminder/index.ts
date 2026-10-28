/**
 * sign-in-reminder: emails the owner before anything the club renews runs
 * out: Apple sign-in's secret and every dated item on Admin → Keys & renewals.
 *
 * Called each morning through pg_net by `sign_in_secret_remind`
 * (20261011080000) with the vault's `sign_in_reminder_secret`. It asks
 * `renewals_due` (20261028200000), which checks that secret, what is due
 * today, and emails each one through Resend. Most days nothing is due and
 * nothing is sent.
 *
 * Deployed with `verify_jwt = false`, like push-notify: the caller is the
 * database, not a member. Anybody can call the public URL; without the secret
 * the database refuses, and with it the most that happens is the reminder
 * that was due anyway, once a day.
 *
 * Secrets (`pnpm exec supabase secrets set`): RESEND_API_KEY, REMINDER_TO
 * (the owner's address), and optionally REMINDER_FROM. SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 */

import { type DueSecret, reminderEmail } from './compose.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const REMINDER_TO = Deno.env.get('REMINDER_TO') ?? '';
const REMINDER_FROM = Deno.env.get('REMINDER_FROM') ?? 'The SCI Club <hello@thesciclub.com>';

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply(405, { error: 'POST only' });
  if (!RESEND_API_KEY || !REMINDER_TO) {
    console.error('sign-in-reminder: RESEND_API_KEY or REMINDER_TO is not set');
    return reply(500, { error: 'not configured' });
  }

  const headers: Record<string, string> = {
    apikey: SERVICE_KEY,
    'Content-Type': 'application/json',
  };
  if (!SERVICE_KEY.startsWith('sb_')) headers.Authorization = `Bearer ${SERVICE_KEY}`;
  const dueResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/renewals_due`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_secret: request.headers.get('x-reminder-secret') ?? '' }),
  });
  if (!dueResponse.ok) {
    if (dueResponse.status === 401 || dueResponse.status === 403) {
      return reply(401, { error: 'not the reminder' });
    }
    console.error('sign-in-reminder: renewals_due failed', dueResponse.status);
    return reply(502, { error: 'could not read what is due' });
  }
  const due = (await dueResponse.json()) as DueSecret[];

  let sent = 0;
  for (const row of due) {
    const email = reminderEmail(row);
    const sendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: REMINDER_FROM,
        to: [REMINDER_TO],
        subject: email.subject,
        text: email.text,
      }),
    });
    if (sendResponse.ok) sent += 1;
    else
      console.error(
        'sign-in-reminder: Resend refused',
        sendResponse.status,
        await sendResponse.text(),
      );
  }
  return reply(200, { due: due.length, sent });
});
