import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * An organization's people, and telling them about its events
 * (20261103000000): for its org admins on Stats & controls.
 */

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

async function call(
  fn: string,
  args: Record<string, unknown>,
  fallback: string,
): Promise<Result<unknown>> {
  try {
    const { data, error } = (await getSupabase().rpc(fn, args)) as {
      data: unknown;
      error: Failure | null;
    };
    if (error) return { ok: false, error: describeError(error, fallback) };
    return { ok: true, value: data };
  } catch (e) {
    return { ok: false, error: describeThrown(e, fallback) };
  }
}

/* ---------------------------------------------------------------- people */

export interface OrganizationPerson {
  id: string;
  name: string;
  photoPath: string | null;
  avatarColor: string | null;
  isOrgAdmin: boolean;
  isMentor: boolean;
}

interface PersonRow {
  member_id: string;
  display_name: string;
  photo_path: string | null;
  avatar_color: string | null;
  is_org_admin: boolean;
  is_mentor: boolean;
}

/** Org admins first, then mentors, then members, each by name. */
export async function fetchOrganizationPeople(
  organizationId: string,
): Promise<Result<OrganizationPerson[]>> {
  const result = await call(
    'organization_people',
    { p_organization: organizationId },
    'Could not load the organization’s people.',
  );
  if (!result.ok) return result;
  return {
    ok: true,
    value: ((result.value as PersonRow[] | null) ?? []).map((row) => ({
      id: row.member_id,
      name: row.display_name,
      photoPath: row.photo_path,
      avatarColor: row.avatar_color,
      isOrgAdmin: row.is_org_admin,
      isMentor: row.is_mentor,
    })),
  };
}

/** "Org admin", "Mentor" or "Member": the most a person is to it. */
export function roleOf(person: { isOrgAdmin: boolean; isMentor: boolean }): string {
  if (person.isOrgAdmin) return 'Org admin';
  if (person.isMentor) return 'Mentor';
  return 'Member';
}

/* --------------------------------------------------------------- notices */

/** Who a notice goes to: everybody it can, or again to those who did not open or answer it. */
export type NoticeAudience = 'everyone' | 'not_opened' | 'no_answer';

export interface EventNotices {
  eventId: string;
  title: string;
  startTime: string;
  timezone: string | null;
  allDay: boolean;
  notified: number;
  opened: number;
  going: number;
  interested: number;
  notOpened: number;
  noAnswer: number;
  /** Who Notify members would tell now: never told, and no answer. */
  canReach: number;
  lastSentAt: string | null;
}

interface EventNoticesRow {
  event_id: string;
  title: string;
  start_time: string;
  timezone: string | null;
  all_day: boolean | null;
  notified: number;
  opened: number;
  going: number;
  interested: number;
  not_opened: number;
  no_answer: number;
  can_reach: number;
  last_sent_at: string | null;
}

/** Its events from a week ago on, soonest first. */
export async function fetchEventNotices(organizationId: string): Promise<Result<EventNotices[]>> {
  const result = await call(
    'organization_event_notices',
    { p_organization: organizationId },
    'Could not load the organization’s events.',
  );
  if (!result.ok) return result;
  return {
    ok: true,
    value: ((result.value as EventNoticesRow[] | null) ?? []).map((row) => ({
      eventId: row.event_id,
      title: row.title,
      startTime: row.start_time,
      timezone: row.timezone,
      allDay: row.all_day === true,
      notified: row.notified,
      opened: row.opened,
      going: row.going,
      interested: row.interested,
      notOpened: row.not_opened,
      noAnswer: row.no_answer,
      canReach: row.can_reach,
      lastSentAt: row.last_sent_at,
    })),
  };
}

export interface NoticeRecipient {
  id: string;
  name: string;
  isOrgAdmin: boolean;
  isMentor: boolean;
  lastSentAt: string;
  sends: number;
  openedAt: string | null;
  rsvp: 'going' | 'interested' | null;
}

interface RecipientRow {
  member_id: string;
  display_name: string;
  is_org_admin: boolean;
  is_mentor: boolean;
  last_sent_at: string;
  sends: number;
  opened_at: string | null;
  rsvp: string | null;
}

/** Who was told of one event: no answer first, then by name. */
export async function fetchNoticeRecipients(eventId: string): Promise<Result<NoticeRecipient[]>> {
  const result = await call(
    'event_notice_recipients',
    { p_event: eventId },
    'Could not load who was notified.',
  );
  if (!result.ok) return result;
  return {
    ok: true,
    value: ((result.value as RecipientRow[] | null) ?? []).map((row) => ({
      id: row.member_id,
      name: row.display_name,
      isOrgAdmin: row.is_org_admin,
      isMentor: row.is_mentor,
      lastSentAt: row.last_sent_at,
      sends: row.sends,
      openedAt: row.opened_at,
      rsvp: row.rsvp === 'going' || row.rsvp === 'interested' ? row.rsvp : null,
    })),
  };
}

/** How many it went to; nobody is told twice in 12 hours. */
export async function notifyMembers(eventId: string, who: NoticeAudience): Promise<Result<number>> {
  const result = await call(
    'notify_members_of_event',
    { p_event: eventId, p_who: who },
    'The notification was not sent. Try again.',
  );
  if (!result.ok) return result;
  return { ok: true, value: typeof result.value === 'number' ? result.value : 0 };
}

/** Whether every new event it adds is told to its people. */
export async function fetchNotifiesMembers(organizationId: string): Promise<Result<boolean>> {
  const fallback = 'Could not load the setting.';
  try {
    const { data, error } = await getSupabase()
      .from('organizations')
      .select('notifies_members_since')
      .eq('id', organizationId)
      .maybeSingle();
    if (error) return { ok: false, error: describeError(error, fallback) };
    const row = data as { notifies_members_since?: string | null } | null;
    return { ok: true, value: Boolean(row?.notifies_members_since) };
  } catch (e) {
    return { ok: false, error: describeThrown(e, fallback) };
  }
}

export async function setNotifiesMembers(
  organizationId: string,
  on: boolean,
): Promise<Result<null>> {
  const result = await call(
    'set_organization_notifies_members',
    { p_organization: organizationId, p_on: on },
    'That was not saved. Try again.',
  );
  return result.ok ? { ok: true, value: null } : result;
}
