import { type InviteEvent, readInvite } from './ics.ts';

/**
 * calendar-inbound's logic, apart from the network so it can be tested
 * (handler.test.ts). See index.ts for what calls it and
 * 20261022220000_calendar_invites.sql for the rules.
 */

/**
 * What representatives invite: received by Resend directly, so Zoho's spam
 * folder never sees it (the owner, 2026-10-23).
 */
const INVITES = 'invites@events.thesciclub.com';
/**
 * invites@events. or the older events@ (a Zoho alias, forwarded), either with
 * +<short code>.
 */
const ADDRESS =
  /^(?:invites(?:\+([a-z0-9-]{1,20}))?@events\.thesciclub\.com|events(?:\+([a-z0-9-]{1,20}))?@thesciclub\.com)$/i;
/** Where Zoho forwards events@, so Resend's envelope recipient; never the one intended. */
export const INBOX = 'inbox@events.thesciclub.com';
/**
 * The club's own mail and the forwarder's: never a representative. Zoho signs
 * what it forwards as thesciclub.com, so DMARC passes even for a forged From.
 */
const NEVER_A_SENDER =
  /(^|\.)(thesciclub\.com|zoho(mail)?\.(com|eu|in|jp|sa|ca|uk|com\.au|com\.cn))$/i;

export interface ReceivedEmail {
  from: string;
  to: string[];
  cc?: string[] | null;
  reply_to?: string[] | null;
  headers?: Record<string, string | string[] | null> | null;
  received_for?: string[] | null;
  subject?: string | null;
  authentication?: { spf?: string; dkim?: string; dmarc?: string } | null;
  attachments?: { id: string; filename?: string | null; content_type?: string | null }[] | null;
  raw?: { download_url?: string | null } | null;
}

export interface ReceiveResult {
  outcome: 'added' | 'updated' | 'cancelled' | 'held' | 'refused' | 'ignored';
  invite?: string;
  event?: string;
  organization?: string | null;
  reason?: string;
  notify?: string[];
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Deps {
  /** The webhook's signing secret, `whsec_…`. */
  secret: string;
  site: string;
  fetchEmail(id: string): Promise<ReceivedEmail | null>;
  fetchAttachment(emailId: string, attachmentId: string): Promise<string | null>;
  fetchText(url: string): Promise<string | null>;
  receive(
    sender: string,
    verified: boolean,
    tag: string | null,
    invite: InviteEvent,
  ): Promise<ReceiveResult>;
  send(mail: Mail): Promise<void>;
  now(): number;
}

/* ---------------------------------------------------------------- webhook */

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Resend signs each delivery the Svix way: HMAC-SHA256, keyed by the secret
 * after its `whsec_`, over `id.timestamp.body`, base64, in a list of `v1,…`.
 * Five minutes either way, against a replay.
 */
export async function signatureIsGood(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowMs: number,
): Promise<boolean> {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  const sent = Number(headers.timestamp) * 1000;
  if (!Number.isFinite(sent) || Math.abs(nowMs - sent) > 5 * 60 * 1000) return false;
  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    keyBytes = base64ToBytes(secret.replace(/^whsec_/, ''));
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${headers.id}.${headers.timestamp}.${body}`),
  );
  const expected = bytesToBase64(mac);
  return headers.signature
    .split(' ')
    .map((part) => part.split(',')[1] ?? '')
    .some((candidate) => candidate.length === expected.length && candidate === expected);
}

/* ------------------------------------------------------------------- mail */

/** The bare address of `Name <a@b.c>` or `a@b.c`. */
export function bareAddress(from: string): string {
  const angled = /<([^>]+)>/.exec(from);
  return (angled?.[1] ?? from).trim().toLowerCase();
}

/** A header's values, whatever case Resend keys it by. */
export function header(email: ReceivedEmail, name: string): string[] {
  const values: string[] = [];
  for (const [key, value] of Object.entries(email.headers ?? {})) {
    if (key.toLowerCase() !== name || value == null) continue;
    values.push(...(Array.isArray(value) ? value : [value]));
  }
  return values;
}

/** Every address in address lists, display names and quoted parts left out. */
export function addressesIn(values: string[]): string[] {
  return values.flatMap((value) =>
    (
      value.replace(/"(?:[^"\\]|\\.)*"/g, ' ').match(/[^\s<>,;:"()[\]]+@[^\s<>,;:"()[\]]+/g) ?? []
    ).map((address) => address.toLowerCase()),
  );
}

/**
 * Who sent it, and whether Resend's DMARC verdict is about them. DMARC judges
 * the From domain, so only an original From is verified; when a forwarder
 * rewrote From, the original (X-Original-From, then Reply-To) is unverified.
 */
export function senderOf(email: ReceivedEmail): { address: string; verified: boolean } | null {
  const usable = (address: string) =>
    address.includes('@') && !NEVER_A_SENDER.test(address.split('@').pop() ?? '');
  const from = bareAddress(email.from);
  if (usable(from)) return { address: from, verified: email.authentication?.dmarc === 'pass' };
  const original = addressesIn([
    ...header(email, 'x-original-from'),
    ...(email.reply_to ?? []),
    ...header(email, 'reply-to'),
  ]).find(usable);
  return original ? { address: original, verified: false } : null;
}

/**
 * Which invitation address it was sent to, and its short code. After Zoho's
 * hop the envelope says INBOX, so the headers say whom it was meant for.
 */
export function eventsAddress(email: ReceivedEmail): { tag: string | null } | null {
  const addresses = addressesIn([
    ...email.to,
    ...(email.cc ?? []),
    ...['to', 'cc', 'delivered-to', 'x-original-to', 'x-forwarded-to'].flatMap((name) =>
      header(email, name),
    ),
    ...(email.received_for ?? []),
  ]);
  let found: { tag: string | null } | null = null;
  for (const address of addresses) {
    const match = ADDRESS.exec(address);
    const tag = match?.[1] ?? match?.[2];
    if (tag) return { tag };
    if (match) found = { tag: null };
  }
  return found;
}

function decodeQuotedPrintable(text: string): string {
  return text
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** The text/calendar part of a whole email, decoded; null when it has none. */
export function calendarFromMime(raw: string): string | null {
  const lines = raw.replace(/\r\n/g, '\n');
  const header = /(^|\n)Content-Type:\s*text\/calendar[^\n]*(\n[ \t][^\n]*)*/i.exec(lines);
  if (!header) {
    const bare = /BEGIN:VCALENDAR[\s\S]*?END:VCALENDAR/.exec(lines);
    return bare ? bare[0] : null;
  }
  const blockStart = lines.lastIndexOf('\n\n', header.index) + 1;
  const bodyStart = lines.indexOf('\n\n', header.index);
  if (bodyStart < 0) return null;
  const headers = lines.slice(blockStart, bodyStart);
  const rest = lines.slice(bodyStart + 2);
  const end = rest.search(/\n--[^\n]+/);
  const body = end >= 0 ? rest.slice(0, end) : rest;
  const encoding = /Content-Transfer-Encoding:\s*([^\s;]+)/i.exec(headers)?.[1]?.toLowerCase();
  if (encoding === 'base64') {
    try {
      return new TextDecoder().decode(base64ToBytes(body.replace(/\s+/g, '')));
    } catch {
      return null;
    }
  }
  if (encoding === 'quoted-printable') return decodeQuotedPrintable(body);
  return body;
}

async function calendarText(
  deps: Deps,
  emailId: string,
  email: ReceivedEmail,
): Promise<string | null> {
  for (const attachment of email.attachments ?? []) {
    const isCalendar =
      (attachment.content_type ?? '').toLowerCase().includes('calendar') ||
      (attachment.filename ?? '').toLowerCase().endsWith('.ics');
    if (!isCalendar) continue;
    const text = await deps.fetchAttachment(emailId, attachment.id);
    if (text?.includes('BEGIN:VCALENDAR')) return text;
  }
  const rawUrl = email.raw?.download_url;
  if (rawUrl) {
    const raw = await deps.fetchText(rawUrl);
    if (raw) return calendarFromMime(raw);
  }
  return null;
}

function whenLine(invite: InviteEvent): string {
  const when = new Date(invite.starts).toLocaleString('en-US', {
    timeZone: invite.timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(invite.allDay ? {} : { hour: 'numeric', minute: '2-digit' }),
  });
  return invite.location ? `${when}, ${invite.location}` : when;
}

/** What to tell whom, for each outcome. Nothing for an ignored one: no reply to strangers. */
export function repliesFor(
  result: ReceiveResult,
  invite: InviteEvent,
  sender: string,
  site: string,
): Mail[] {
  const title = invite.title || 'Your event';
  const note = invite.repeatNote ? `\n\n${invite.repeatNote}` : '';
  switch (result.outcome) {
    case 'added':
    case 'updated':
      return [
        {
          to: sender,
          subject: `${result.outcome === 'added' ? 'Added to' : 'Updated in'} The SCI Club: ${title}`,
          text: `${title}\n${whenLine(invite)}\nHosted by ${result.organization ?? 'The SCI Club'}\n\n${site}/events/${result.event ?? ''}\n\nChanges to the invitation are copied to the club, and cancelling it takes the event off.${note}`,
        },
      ];
    case 'cancelled':
      return [
        {
          to: sender,
          subject: `Taken off The SCI Club: ${title}`,
          text: `The invitation was cancelled, so ${title} is no longer on the club's calendar.`,
        },
      ];
    case 'held': {
      const waiting = `${site}/events/invites`;
      return [
        {
          to: sender,
          subject: `Waiting for approval: ${title}`,
          text: `${title} is waiting before it goes on The SCI Club's calendar.\n\n${result.reason ?? ''}\n\nA representative of the organization can approve it here: ${waiting}`,
        },
        ...(result.notify ?? [])
          .filter((address) => address !== sender)
          .map((address) => ({
            to: address,
            subject: `A calendar invitation is waiting: ${title}`,
            text: `${sender} invited ${INVITES} to ${title} (${whenLine(invite)}).\n\n${result.reason ?? ''}\n\nApprove or discard it: ${waiting}`,
          })),
      ];
    }
    case 'refused':
      return [
        {
          to: sender,
          subject: `Not added to The SCI Club: ${title}`,
          text: `${title} could not be added: ${result.reason ?? 'the club refused it'}\n\nChange the invitation and send it again, or add the event in the club.`,
        },
      ];
    default:
      return [];
  }
}

/* ---------------------------------------------------------------- handler */

export async function handle(
  deps: Deps,
  body: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
): Promise<{ status: number; outcome: string }> {
  if (!(await signatureIsGood(deps.secret, headers, body, deps.now()))) {
    return { status: 401, outcome: 'bad signature' };
  }
  let event: { type?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(body) as typeof event;
  } catch {
    return { status: 400, outcome: 'not json' };
  }
  const emailId = event.data?.email_id;
  if (event.type !== 'email.received' || !emailId) return { status: 200, outcome: 'not an email' };

  const email = await deps.fetchEmail(emailId);
  if (!email) return { status: 502, outcome: 'could not read the email' };
  const to = eventsAddress(email);
  if (!to) return { status: 200, outcome: 'not for invites@ or events@' };
  const from = senderOf(email);
  if (!from) return { status: 200, outcome: 'from the club or its forwarder' };

  const text = await calendarText(deps, emailId, email);
  const invite = text ? readInvite(text) : null;
  if (!invite) return { status: 200, outcome: 'no invitation in it' };

  const sender = from.address;
  const result = await deps.receive(sender, from.verified, to.tag, invite);
  for (const mail of repliesFor(result, invite, sender, deps.site)) {
    await deps.send(mail);
  }
  return { status: 200, outcome: result.outcome };
}
