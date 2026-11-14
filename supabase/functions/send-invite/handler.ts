/**
 * The rules of send-invite, with every outside thing passed in so the rules
 * can be tested: who may send, what must be true, in what order.
 */

import { eventInviteEmail, withRsvp } from '../_shared/event-invite-email.ts';
import { eventInviteLink, type InviteEmail, inviteEmail, inviteLink } from './compose.ts';

export interface InviteRow {
  id: string;
  email: string | null;
  status: string;
  sent_at: string | null;
  invited_by_member_id: string | null;
  invited_by_organization_id: string | null;
  /** The organization they join with (20261030000000); the email names it. */
  for_organization_id?: string | null;
  /** From a spreadsheet (20261114010000). */
  invitee_name?: string | null;
  message?: string | null;
  /** The event it was sent for (20261114020000). */
  event_id?: string | null;
  /** Names it in the email's open picture (20261114030000). */
  open_key?: string | null;
}

export interface EventSummary {
  title: string;
  start: string | null;
  timezone: string | null;
  allDay: boolean;
  /** For the event's own email (20261114070000). */
  end?: string | null;
  place?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  organization?: string | null;
}

export interface Deps {
  /** The signed-in caller's id for this bearer token, or null. */
  callerId(jwt: string): Promise<string | null>;
  isAdmin(memberId: string): Promise<boolean>;
  loadInvite(id: string): Promise<InviteRow | null>;
  /** The organization's name or the member's display name. */
  inviterName(invite: InviteRow): Promise<string>;
  organizationName(id: string): Promise<string>;
  /** The event an invite was sent for, or null when it is gone. */
  eventFor(id: string): Promise<EventSummary | null>;
  /** Stores the hash if the invite is still pending; false when it no longer is. */
  saveTokenHash(id: string, hash: string): Promise<boolean>;
  markSent(id: string, at: string): Promise<void>;
  sendEmail(to: string, email: InviteEmail): Promise<boolean>;
  now(): Date;
  /** 32 random bytes as base64url. */
  newToken(): string;
  siteUrl: string;
  /** Where invite-opened answers: https://<ref>.supabase.co/functions/v1/invite-opened. */
  openPixelUrl?: string;
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
  // An organization's own invite already says its name; one a member sends
  // for an organization names it beside them.
  const withOrganization =
    invite.for_organization_id && invite.for_organization_id !== invite.invited_by_organization_id
      ? await deps.organizationName(invite.for_organization_id)
      : null;
  // An invite sent for an event (20261114020000) is the event as its page
  // shows it, with Going, Maybe and Can't go (20261114070000).
  const event = invite.event_id ? await deps.eventFor(invite.event_id) : null;
  const pixel =
    invite.open_key && deps.openPixelUrl
      ? `${deps.openPixelUrl}?k=${encodeURIComponent(invite.open_key)}`
      : null;
  const inviter = await deps.inviterName(invite);
  let email: InviteEmail;
  if (invite.event_id && event) {
    const page = eventInviteLink(invite.event_id, token, deps.siteUrl);
    email = eventInviteEmail({
      inviter,
      name: invite.invitee_name ?? null,
      message: invite.message ?? null,
      event: {
        title: event.title,
        start: event.start,
        end: event.end ?? null,
        timezone: event.timezone,
        allDay: event.allDay,
        place: event.place ?? null,
        description: event.description ?? null,
        imageUrl: event.imageUrl ?? null,
        imageAlt: event.imageAlt ?? null,
        organization: event.organization ?? null,
      },
      links: {
        going: withRsvp(page, 'going'),
        interested: withRsvp(page, 'interested'),
        no: withRsvp(page, 'no'),
        page,
        join: inviteLink(token, deps.siteUrl),
      },
      reader: 'guest',
      joinsWith: withOrganization,
      pixel,
    });
  } else {
    email = inviteEmail(
      {
        inviter,
        organization: withOrganization,
        name: invite.invitee_name ?? null,
        message: invite.message ?? null,
      },
      inviteLink(token, deps.siteUrl),
      pixel,
    );
  }
  if (!(await deps.sendEmail(invite.email, email))) {
    return { status: 502, body: { error: 'The email could not be sent. Try again.' } };
  }
  await deps.markSent(invite.id, deps.now().toISOString());
  return { status: 200, body: { sent: true } };
}
