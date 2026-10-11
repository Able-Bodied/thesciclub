import { describe, expect, it } from 'vitest';
import { inviteEmail, inviteLink } from './compose.ts';
import { type Deps, type InviteRow, RESEND_WAIT_SECONDS, sendInvite, sha256Hex } from './handler.ts';

const INVITE_ID = '11111111-1111-4111-8111-111111111111';
const MAYA = '22222222-2222-4222-8222-222222222222';
const SAM = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-10-11T12:00:00Z');

function invite(overrides: Partial<InviteRow> = {}): InviteRow {
  return {
    id: INVITE_ID,
    email: 'newcomer@example.com',
    status: 'pending',
    sent_at: null,
    invited_by_member_id: MAYA,
    invited_by_organization_id: null,
    ...overrides,
  };
}

function setup(row: InviteRow | null = invite(), admins: string[] = []) {
  const log = { hashes: [] as string[], sent: [] as { to: string; text: string }[], marked: 0 };
  const deps: Deps = {
    callerId: async (jwt) => ({ maya: MAYA, sam: SAM }[jwt] ?? null),
    isAdmin: async (id) => admins.includes(id),
    loadInvite: async () => row,
    inviterName: async () => 'Maya',
    saveTokenHash: async (_id, hash) => {
      log.hashes.push(hash);
      return true;
    },
    markSent: async () => {
      log.marked += 1;
    },
    sendEmail: async (to, email) => {
      log.sent.push({ to, text: email.text });
      return true;
    },
    now: () => NOW,
    newToken: () => `token-${log.hashes.length + 1}`,
    siteUrl: 'https://thesciclub.com',
  };
  return { deps, log };
}

describe('send-invite', () => {
  it('sends the link to the invited address and stores only the hash', async () => {
    const { deps, log } = setup();
    const result = await sendInvite('Bearer maya', { invite_id: INVITE_ID }, deps);
    expect(result).toEqual({ status: 200, body: { sent: true } });
    expect(log.sent).toHaveLength(1);
    expect(log.sent[0]?.to).toBe('newcomer@example.com');
    expect(log.sent[0]?.text).toContain('https://thesciclub.com/join?invite=token-1');
    expect(log.hashes).toEqual([await sha256Hex('token-1')]);
    expect(log.hashes[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(log.marked).toBe(1);
  });

  it('refuses a caller who is not signed in', async () => {
    const { deps, log } = setup();
    for (const bearer of [null, 'Bearer nobody']) {
      expect((await sendInvite(bearer, { invite_id: INVITE_ID }, deps)).status).toBe(401);
    }
    expect(log.sent).toHaveLength(0);
  });

  it('is not yours: another member gets "no such invite", and nothing is sent or stored', async () => {
    const { deps, log } = setup();
    const result = await sendInvite('Bearer sam', { invite_id: INVITE_ID }, deps);
    expect(result.status).toBe(404);
    expect(log.sent).toHaveLength(0);
    expect(log.hashes).toHaveLength(0);
  });

  it('answers an unknown invite the same as one that is not yours', async () => {
    const { deps } = setup(null);
    const unknown = await sendInvite('Bearer maya', { invite_id: INVITE_ID }, deps);
    const other = await sendInvite('Bearer sam', { invite_id: INVITE_ID }, setup().deps);
    expect(unknown).toEqual(other);
  });

  it('lets an administrator send anyone’s, including an organization’s', async () => {
    const row = invite({ invited_by_member_id: null, invited_by_organization_id: 'org' });
    const { deps, log } = setup(row, [SAM]);
    expect((await sendInvite('Bearer sam', { invite_id: INVITE_ID }, deps)).status).toBe(200);
    expect(log.sent).toHaveLength(1);
  });

  it('does not let a member send an organization’s invite', async () => {
    const row = invite({ invited_by_member_id: null, invited_by_organization_id: 'org' });
    const { deps } = setup(row);
    expect((await sendInvite('Bearer maya', { invite_id: INVITE_ID }, deps)).status).toBe(404);
  });

  it('is not pending: a used or revoked invite is refused, even for its owner', async () => {
    for (const status of ['consumed', 'revoked']) {
      const { deps, log } = setup(invite({ status }));
      const result = await sendInvite('Bearer maya', { invite_id: INVITE_ID }, deps);
      expect(result.status).toBe(409);
      expect(log.sent).toHaveLength(0);
      expect(log.hashes).toHaveLength(0);
    }
  });

  it('refuses when the invite stops being pending between the read and the write', async () => {
    const { deps, log } = setup();
    deps.saveTokenHash = async () => false;
    expect((await sendInvite('Bearer maya', { invite_id: INVITE_ID }, deps)).status).toBe(409);
    expect(log.sent).toHaveLength(0);
  });

  it('refuses an old phone invite, which has no address', async () => {
    const { deps } = setup(invite({ email: null }));
    expect((await sendInvite('Bearer maya', { invite_id: INVITE_ID }, deps)).status).toBe(422);
  });

  it('refuses a bad body', async () => {
    const { deps } = setup();
    for (const body of [null, {}, { invite_id: 5 }, { invite_id: 'not-a-uuid' }]) {
      expect((await sendInvite('Bearer maya', body, deps)).status).toBe(400);
    }
  });

  it('makes a new token for each send, and waits a minute between them', async () => {
    const recent = new Date(NOW.getTime() - (RESEND_WAIT_SECONDS - 5) * 1000).toISOString();
    const early = setup(invite({ sent_at: recent }));
    expect((await sendInvite('Bearer maya', { invite_id: INVITE_ID }, early.deps)).status).toBe(429);
    expect(early.log.sent).toHaveLength(0);

    const old = new Date(NOW.getTime() - (RESEND_WAIT_SECONDS + 5) * 1000).toISOString();
    const later = setup(invite({ sent_at: old }));
    await sendInvite('Bearer maya', { invite_id: INVITE_ID }, later.deps);
    await sendInvite('Bearer maya', { invite_id: INVITE_ID }, later.deps);
    expect(new Set(later.log.hashes).size).toBe(2);
  });

  it('says so when Resend refuses, and does not mark it sent', async () => {
    const { deps, log } = setup();
    deps.sendEmail = async () => false;
    expect((await sendInvite('Bearer maya', { invite_id: INVITE_ID }, deps)).status).toBe(502);
    expect(log.marked).toBe(0);
  });
});

describe('the invite email', () => {
  it('names who invited them and carries the link in both forms', () => {
    const link = inviteLink('a-b_c', 'https://thesciclub.com/');
    expect(link).toBe('https://thesciclub.com/join?invite=a-b_c');
    const email = inviteEmail('Maya', link);
    expect(email.subject).toBe('Maya invited you to The SCI Club');
    expect(email.text).toContain(link);
    expect(email.html).toContain(`href="${link}"`);
    expect(email.html).toContain(`>${link}</a>`);
  });

  it('escapes a name that carries markup, and says nothing about injury', () => {
    const email = inviteEmail('<b>Eve</b> & "Co"', 'https://thesciclub.com/join?invite=x');
    expect(email.html).not.toContain('<b>Eve');
    expect(email.html).toContain('&lt;b&gt;Eve&lt;/b&gt; &amp; &quot;Co&quot;');
    expect(`${email.subject}${email.text}${email.html}`.toLowerCase()).not.toContain('injur');
  });

  it('copes with a missing name', () => {
    expect(inviteEmail('  ', 'https://x/y').subject).toBe(
      'Someone in the club invited you to The SCI Club',
    );
  });
});
