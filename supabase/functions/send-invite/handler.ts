/**
 * The rules of send-invite, with every outside thing passed in so the rules
 * can be tested: who may send, what must be true, in what order.
 */

import { inviteEmail, inviteLink } from './compose.ts';

export interface InviteRow {
  id: string;
  email: string | null;
  status: string;
  sent_at: string | null;
  invited_by_member_id: string | null;
  invited_by_organization_id: string | null;
}

export interface Deps {
  /** The signed-in caller's id for this bearer token, or null. */
  callerId(jwt: string): Promise<string | null>;
  isAdmin(memberId: string): Promise<boolean>;
  loadInvite(id: string): Promise<InviteRow | null>;
  /** The organization's name or the member's display name. */
  inviterName(invite: InviteRow): Promise<string>;
  /** Stores the hash if the invite is still pending; false when it no longer is. */
  saveTokenHash(id: string, hash: string): Promise<boolean>;
  markSent(id: string, at: string): Promise<void>;
  sendEmail(to: string, email: { subject: string; text: string; html: string }): Promise<boolean>;
  now(): Date;
  /** 32 random bytes as base64url. */
  newToken(): string;
  siteUrl: string;
}

export interface Reply {
  status: number;
  body: Record<string, unknown>;
}

/** A resend inside this window is refused, so a double tap does not send two. */
export const RESEND_WAIT_SECONDS = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sendInvite(
  bearer: string | null,
  payload: unknown,
  deps: Deps,
): Promise<Reply> {
  const jwt = bearer?.replace(/^Bearer\s+/i, '').trim();
  const caller = jwt ? await deps.callerId(jwt) : null;
  if (!caller) return { status: 401, body: { error: 'Sign in first.' } };

  const inviteId = (payload as { invite_id?: unknown } | null)?.invite_id;
  if (typeof inviteId !== 'string' || !UUID.test(inviteId)) {
    return { status: 400, body: { error: 'invite_id is required.' } };
  }

  // Unknown and not-yours answer alike, so ids cannot be probed.
  const notFound: Reply = { status: 404, body: { error: 'No such invite.' } };
  const invite = await deps.loadInvite(inviteId);
  if (!invite) return notFound;
  const theirs = invite.invited_by_member_id === caller;
  if (!theirs && !(await deps.isAdmin(caller))) return notFound;

  if (invite.status !== 'pending') {
    return { status: 409, body: { error: 'That invite is no longer pending.' } };
  }
  if (!invite.email) {
    return { status: 422, body: { error: 'That invite has no email address.' } };
  }
  if (
    invite.sent_at &&
    deps.now().getTime() - new Date(invite.sent_at).getTime() < RESEND_WAIT_SECONDS * 1000
  ) {
    return { status: 429, body: { error: 'Sent a moment ago. Wait a minute to send it again.' } };
  }

  // The new hash goes in before the email goes out, so a link that was
  // emailed is always one that works. A failed send leaves the old link dead;
  // pressing Resend makes another.
  const token = deps.newToken();
  if (!(await deps.saveTokenHash(invite.id, await sha256Hex(token)))) {
    return { status: 409, body: { error: 'That invite is no longer pending.' } };
  }
  const email = inviteEmail(await deps.inviterName(invite), inviteLink(token, deps.siteUrl));
  if (!(await deps.sendEmail(invite.email, email))) {
    return { status: 502, body: { error: 'The email could not be sent. Try again.' } };
  }
  await deps.markSent(invite.id, deps.now().toISOString());
  return { status: 200, body: { sent: true } };
}
