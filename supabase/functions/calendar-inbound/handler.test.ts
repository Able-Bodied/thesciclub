import { describe, expect, it } from 'vitest';
import {
  bareAddress,
  calendarFromMime,
  type Deps,
  eventsAddress,
  handle,
  INBOX,
  type Mail,
  type ReceivedEmail,
  type ReceiveResult,
  signatureIsGood,
} from './handler.ts';
import type { InviteEvent } from './ics.ts';

const SECRET = `whsec_${btoa('a test signing secret of 32 bytes!')}`;
const NOW = 1_792_700_000_000;

async function sign(body: string, id = 'msg_1', timestamp = String(NOW / 1000)) {
  const key = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(atob(SECRET.slice(6)), (c) => c.charCodeAt(0)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  const signature = btoa(
    Array.from(new Uint8Array(mac), (byte) => String.fromCharCode(byte)).join(''),
  );
  return { id, timestamp, signature: `v1,${signature}` };
}

const ICS = [
  'BEGIN:VCALENDAR',
  'METHOD:REQUEST',
  'BEGIN:VEVENT',
  'UID:abc@google.com',
  'DTSTART;TZID=America/Los_Angeles:20261030T183000',
  'DTEND;TZID=America/Los_Angeles:20261030T200000',
  'SUMMARY:Friday Happy Hour',
  'LOCATION:Lakeside Park',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

function fakeDeps(o: {
  email?: ReceivedEmail;
  result?: ReceiveResult;
}): Deps & { sent: Mail[]; received: unknown[] } {
  const sent: Mail[] = [];
  const received: unknown[] = [];
  return {
    sent,
    received,
    secret: SECRET,
    site: 'https://thesciclub.com',
    fetchEmail: () =>
      Promise.resolve(
        o.email ?? {
          from: 'NorCal SCI <rep@norcalsci.org>',
          to: ['events@thesciclub.com'],
          authentication: { dmarc: 'pass' },
          attachments: [{ id: 'att1', filename: 'invite.ics', content_type: 'text/calendar' }],
        },
      ),
    fetchAttachment: () => Promise.resolve(ICS),
    fetchText: () => Promise.resolve(null),
    receive: (sender: string, verified: boolean, tag: string | null, invite: InviteEvent) => {
      received.push({ sender, verified, tag, title: invite.title });
      return Promise.resolve(
        o.result ?? { outcome: 'added', event: 'e1', organization: 'NorCal SCI', invite: 'i1' },
      );
    },
    send: (mail) => {
      sent.push(mail);
      return Promise.resolve();
    },
    now: () => NOW,
  };
}

const webhook = JSON.stringify({ type: 'email.received', data: { email_id: 'em_1' } });

describe('the webhook’s signature', () => {
  it('takes Resend’s, and nothing else', async () => {
    const headers = await sign(webhook);
    expect(await signatureIsGood(SECRET, headers, webhook, NOW)).toBe(true);
    expect(await signatureIsGood(SECRET, headers, `${webhook} `, NOW)).toBe(false);
    expect(await signatureIsGood(SECRET, { ...headers, signature: 'v1,bad' }, webhook, NOW)).toBe(
      false,
    );
    expect(await signatureIsGood('', headers, webhook, NOW)).toBe(false);
  });

  it('refuses an old delivery, against a replay', async () => {
    const headers = await sign(webhook, 'msg_1', String(NOW / 1000 - 600));
    expect(await signatureIsGood(SECRET, headers, webhook, NOW)).toBe(false);
  });

  it('answers 401 to an unsigned one, and reads nothing', async () => {
    const deps = fakeDeps({});
    const result = await handle(deps, webhook, { id: null, timestamp: null, signature: null });
    expect(result.status).toBe(401);
    expect(deps.received).toHaveLength(0);
  });
});

describe('the address', () => {
  it('finds events@thesciclub.com and its short code', () => {
    expect(eventsAddress({ from: '', to: ['events@thesciclub.com'] })).toEqual({ tag: null });
    expect(eventsAddress({ from: '', to: ['Events <events+NCS@thesciclub.com>'] })).toEqual({
      tag: 'ncs',
    });
    expect(
      eventsAddress({ from: '', to: ['x@y.z'], received_for: ['events@thesciclub.com'] }),
    ).toEqual({ tag: null });
    expect(eventsAddress({ from: '', to: ['hello@thesciclub.com'] })).toBeNull();
    // The club does not own thesciclub.org.
    expect(eventsAddress({ from: '', to: ['events@thesciclub.org'] })).toBeNull();
  });

  it('after Zoho forwards it, reads whom it was meant for from the headers', () => {
    const forwarded = (headers: Record<string, string | string[]>) =>
      eventsAddress({ from: '', to: [INBOX], received_for: [INBOX], headers });
    expect(forwarded({ To: 'NorCal SCI Events <events@thesciclub.com>' })).toEqual({ tag: null });
    expect(forwarded({ cc: ['a@b.c, "Club" <events+NCS@thesciclub.com>'] })).toEqual({
      tag: 'ncs',
    });
    expect(forwarded({ 'Delivered-To': 'events+ab@thesciclub.com' })).toEqual({ tag: 'ab' });
    expect(forwarded({ 'X-Original-To': 'events@thesciclub.com' })).toEqual({ tag: null });
    // The short code wins over the bare address, wherever each is.
    expect(
      forwarded({ to: 'events@thesciclub.com', 'x-original-to': 'events+ncs@thesciclub.com' }),
    ).toEqual({ tag: 'ncs' });
    // The inbox alone is not an event address, nor a quoted name that looks like one.
    expect(forwarded({})).toBeNull();
    expect(forwarded({ to: '"events@thesciclub.com" <hello@thesciclub.com>' })).toBeNull();
  });

  it('reads the bare sender', () => {
    expect(bareAddress('NorCal SCI <Rep@NorCalSCI.org>')).toBe('rep@norcalsci.org');
  });
});

describe('the calendar in a whole email', () => {
  it('decodes a base64 text/calendar part', () => {
    const raw = [
      'Content-Type: multipart/mixed; boundary="b"',
      '',
      '--b',
      'Content-Type: text/plain',
      '',
      'Hello',
      '--b',
      'Content-Type: text/calendar; charset="UTF-8"; method=REQUEST',
      'Content-Transfer-Encoding: base64',
      '',
      btoa(ICS),
      '--b--',
    ].join('\r\n');
    expect(calendarFromMime(raw)).toBe(ICS);
  });
});

describe('an invitation arriving', () => {
  it('a verified one is added, and the sender told with the link', async () => {
    const deps = fakeDeps({});
    const result = await handle(deps, webhook, await sign(webhook));
    expect(result).toEqual({ status: 200, outcome: 'added' });
    expect(deps.received).toEqual([
      { sender: 'rep@norcalsci.org', verified: true, tag: null, title: 'Friday Happy Hour' },
    ]);
    expect(deps.sent).toHaveLength(1);
    expect(deps.sent[0]).toMatchObject({
      to: 'rep@norcalsci.org',
      subject: 'Added to The SCI Club: Friday Happy Hour',
    });
    expect(deps.sent[0]?.text).toContain('https://thesciclub.com/events/e1');
  });

  it('one that fails DMARC goes to the database as unverified', async () => {
    const deps = fakeDeps({
      email: {
        from: 'rep@norcalsci.org',
        to: ['events@thesciclub.com'],
        authentication: { dmarc: 'fail' },
        attachments: [{ id: 'att1', filename: 'invite.ics', content_type: 'text/calendar' }],
      },
      result: {
        outcome: 'held',
        reason: 'Not verified.',
        notify: ['rep@norcalsci.org', 'two@x.org'],
      },
    });
    await handle(deps, webhook, await sign(webhook));
    expect(deps.received[0]).toMatchObject({ verified: false });
    // The sender, and the other representative; not the sender twice.
    expect(deps.sent.map((m) => m.to)).toEqual(['rep@norcalsci.org', 'two@x.org']);
    expect(deps.sent[1]?.text).toContain('https://thesciclub.com/events/invites');
  });

  it('says nothing to a stranger', async () => {
    const deps = fakeDeps({ result: { outcome: 'ignored', reason: 'Not from a member.' } });
    await handle(deps, webhook, await sign(webhook));
    expect(deps.sent).toHaveLength(0);
  });

  it('leaves mail to other addresses alone', async () => {
    const deps = fakeDeps({ email: { from: 'a@b.c', to: ['hello@thesciclub.com'] } });
    expect((await handle(deps, webhook, await sign(webhook))).outcome).toBe('not for events@');
    expect(deps.received).toHaveLength(0);
  });
});
