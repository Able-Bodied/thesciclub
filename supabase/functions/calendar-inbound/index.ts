/**
 * calendar-inbound: events from calendar invitations sent to
 * invites@events.thesciclub.com (the owner, 2026-10-22).
 *
 * Resend receives the mail for events.thesciclub.com and posts `email.received`
 * here. This checks Resend's signature, reads the email back from Resend's
 * API (the webhook carries no attachments), finds the calendar file, and hands
 * the invitation to `calendar_invite_receive` (20261022220000), which decides
 * everything: who sent it, whether it was verified, which organization, and
 * whether it is added, changed, cancelled or held. Then it emails the sender,
 * and for a held one the organization's representatives. The logic is in
 * handler.ts; this file is only the network.
 *
 * Deploy with `--no-verify-jwt`: Resend has no Supabase session; its own
 * signature is checked instead.
 *
 * Secrets (`pnpm exec supabase secrets set`):
 *   RESEND_API_KEY                (already set for send-invite)
 *   RESEND_INBOUND_SECRET         the webhook's signing secret, whsec_…
 *   CALENDAR_FROM                 optional; INVITE_FROM is used without it
 *   SITE_URL                      optional
 */

import { type Deps, handle, type ReceivedEmail, type ReceiveResult } from './handler.ts';
import type { InviteEvent } from './ics.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SECRET = Deno.env.get('RESEND_INBOUND_SECRET') ?? '';
const FROM = Deno.env.get('CALENDAR_FROM') ?? Deno.env.get('INVITE_FROM') ?? '';
const SITE = Deno.env.get('SITE_URL') ?? 'https://thesciclub.com';

const resend = (path: string, init: { method?: string; body?: string } = {}) =>
  fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
  });

const serviceHeaders: Record<string, string> = {
  apikey: SERVICE_KEY,
  'Content-Type': 'application/json',
};
if (!SERVICE_KEY.startsWith('sb_')) serviceHeaders.Authorization = `Bearer ${SERVICE_KEY}`;

const deps: Deps = {
  secret: SECRET,
  site: SITE,
  async fetchEmail(id) {
    const response = await resend(`/emails/receiving/${encodeURIComponent(id)}`);
    return response.ok ? ((await response.json()) as ReceivedEmail) : null;
  },
  async fetchAttachment(emailId, attachmentId) {
    const response = await resend(
      `/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`,
    );
    if (!response.ok) return null;
    const { download_url: url } = (await response.json()) as { download_url?: string };
    return url ? deps.fetchText(url) : null;
  },
  async fetchText(url) {
    const response = await fetch(url);
    return response.ok ? response.text() : null;
  },
  async receive(sender: string, verified: boolean, tag: string | null, invite: InviteEvent) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/calendar_invite_receive`, {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify({ sender, verified, tag, invite }),
    });
    if (!response.ok) {
      console.error('calendar_invite_receive', response.status, await response.text());
      return { outcome: 'ignored', reason: 'The club could not take it just now.' };
    }
    return (await response.json()) as ReceiveResult;
  },
  async send(mail) {
    if (!FROM) return;
    const response = await resend('/emails', {
      method: 'POST',
      body: JSON.stringify({ from: FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
    });
    if (!response.ok) console.error('send', response.status, await response.text());
  },
  now: () => Date.now(),
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('POST only', { status: 405 });
  const body = await request.text();
  const result = await handle(deps, body, {
    id: request.headers.get('svix-id'),
    timestamp: request.headers.get('svix-timestamp'),
    signature: request.headers.get('svix-signature'),
  });
  return new Response(JSON.stringify({ outcome: result.outcome }), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
});
