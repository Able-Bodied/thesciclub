import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * What an org admin or a trusted partner sees of their work on Stats &
 * controls (20261031110000): who they invited or connected, their own counts,
 * their introductions, and their organization's numbers. The database
 * answers only for whoever is signed in.
 */

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** The rows as the database sent them; each caller names their shape. */
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
    if (error) return { ok: false as const, error: describeError(error, fallback) };
    return { ok: true as const, value: data };
  } catch (e) {
    return { ok: false as const, error: describeThrown(e, fallback) };
  }
}

/* ---------------------------------------------------------------- people */

/** Somebody who joined: invited by the partner, introduced by them, or both. */
export interface PartnerMember {
  kind: 'member';
  memberId: string;
  displayName: string;
  photoPath: string | null;
  memberType: string | null;
  invited: boolean;
  invitedAt: string | null;
  joinedAt: string | null;
  profileDone: boolean;
  introducedToMentor: boolean;
  /** Introductions this partner made that include them. */
  introductions: number;
}

/** An invite by email still waiting. */
export interface PartnerPendingInvite {
  kind: 'pending';
  inviteId: string | null;
  email: string;
  invitedAt: string | null;
}

export type PartnerPerson = PartnerMember | PartnerPendingInvite;

interface PersonRow {
  member_id: string | null;
  display_name: string | null;
  photo_path: string | null;
  member_type: string | null;
  invited_email: string | null;
  invited_at: string | null;
  invite_id: string | null;
  invited: boolean | null;
  joined_at: string | null;
  profile_done: boolean | null;
  introduced_to_mentor: boolean | null;
  my_introductions: number | null;
}

export function personFromRow(row: PersonRow): PartnerPerson | null {
  if (row.member_id) {
    return {
      kind: 'member',
      memberId: row.member_id,
      displayName: row.display_name ?? 'Member',
      photoPath: row.photo_path,
      memberType: row.member_type,
      invited: Boolean(row.invited),
      invitedAt: row.invited_at,
      joinedAt: row.joined_at,
      profileDone: Boolean(row.profile_done),
      introducedToMentor: Boolean(row.introduced_to_mentor),
      introductions: row.my_introductions ?? 0,
    };
  }
  if (row.invited_email) {
    return {
      kind: 'pending',
      inviteId: row.invite_id,
      email: row.invited_email,
      invitedAt: row.invited_at,
    };
  }
  return null;
}

export async function fetchMyPeople(): Promise<Result<PartnerPerson[]>> {
  const result = await call('my_people', {}, 'Could not load your people.');
  if (!result.ok) return result;
  return {
    ok: true,
    value: ((result.value as PersonRow[] | null) ?? [])
      .map(personFromRow)
      .filter((person): person is PartnerPerson => person !== null),
  };
}

/* ----------------------------------------------------------------- stats */

export interface PartnerStats {
  invited: number;
  joined: number;
  /** Posted, replied or RSVPed; never messages. */
  active: number;
  introductions: number;
  opened: number;
  withMentor: number;
}

export const STAT_PERIODS = [
  { days: 1, label: '24 hours' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: 'A year' },
] as const;

interface StatsRow {
  invited: number;
  joined: number;
  active: number;
  introductions: number;
  opened: number;
  with_mentor: number;
}

export async function fetchPartnerStats(days: number): Promise<Result<PartnerStats>> {
  const result = await call('my_partner_stats', { p_days: days }, 'Could not load your numbers.');
  if (!result.ok) return result;
  const row = (result.value as StatsRow[] | null)?.[0];
  return {
    ok: true,
    value: {
      invited: row?.invited ?? 0,
      joined: row?.joined ?? 0,
      active: row?.active ?? 0,
      introductions: row?.introductions ?? 0,
      opened: row?.opened ?? 0,
      withMentor: row?.with_mentor ?? 0,
    },
  };
}

/* --------------------------------------------------------- introductions */

export type IntroductionStatus = 'asked' | 'opened' | 'declined' | 'withdrawn' | 'expired';

export interface MadeIntroduction {
  id: string;
  status: IntroductionStatus;
  /** Of the two, how many said yes so far. */
  yeses: number;
  note: string;
  createdAt: string;
  /** Set once opened, while the partner is still in the conversation. */
  threadId: string | null;
  first: { id: string; name: string; photoPath: string | null };
  second: { id: string; name: string; photoPath: string | null };
}

interface IntroductionRow {
  id: string;
  status: string;
  yeses: number;
  note: string;
  created_at: string;
  thread_id: string | null;
  first_id: string;
  first_name: string;
  first_photo: string | null;
  second_id: string;
  second_name: string;
  second_photo: string | null;
}

export async function fetchMyIntroductions(): Promise<Result<MadeIntroduction[]>> {
  const result = await call('my_introductions', {}, 'Could not load your introductions.');
  if (!result.ok) return result;
  return {
    ok: true,
    value: ((result.value as IntroductionRow[] | null) ?? []).map((row) => ({
      id: row.id,
      status: row.status as IntroductionStatus,
      yeses: row.yeses,
      note: row.note,
      createdAt: row.created_at,
      threadId: row.thread_id,
      first: { id: row.first_id, name: row.first_name, photoPath: row.first_photo },
      second: { id: row.second_id, name: row.second_name, photoPath: row.second_photo },
    })),
  };
}

/* ---------------------------------------------------------- organization */

/** An organization's numbers: nothing its org admins cannot see on its page. */
export interface OrganizationStats {
  members: number;
  joined: number;
  left: number;
  waiting: number;
  byCode: number;
  byCheckIn: number;
  eventsHeld: number;
  eventsAhead: number;
  going: number;
  checkedIn: number;
  /** Of those checked in, who had said Going: a walk-in is not turnout. */
  saidGoingAndCame: number;
  reviews: number;
  /** Null with no reviews in the period. */
  rating: number | null;
}

interface OrganizationStatsRow {
  members: number;
  joined: number;
  left_it: number;
  waiting: number;
  by_code: number;
  by_check_in: number;
  events_held: number;
  events_ahead: number;
  going: number;
  checked_in: number;
  said_going_and_came: number;
  reviews: number;
  rating: number | null;
}

export async function fetchOrganizationStats(
  organizationId: string,
  days: number,
): Promise<Result<OrganizationStats | null>> {
  const result = await call(
    'my_organization_stats',
    { p_organization: organizationId, p_days: days },
    'Could not load the organization’s numbers.',
  );
  if (!result.ok) return result;
  const row = (result.value as OrganizationStatsRow[] | null)?.[0];
  return {
    ok: true,
    value: row
      ? {
          members: row.members,
          joined: row.joined,
          left: row.left_it,
          waiting: row.waiting,
          byCode: row.by_code,
          byCheckIn: row.by_check_in,
          eventsHeld: row.events_held,
          eventsAhead: row.events_ahead,
          going: row.going,
          checkedIn: row.checked_in,
          saidGoingAndCame: row.said_going_and_came,
          reviews: row.reviews,
          rating: row.rating,
        }
      : null,
  };
}

/** One event the organization held. */
export interface HeldEvent {
  id: string;
  title: string;
  startTime: string;
  timezone: string | null;
  going: number;
  checkedIn: number;
  saidGoingAndCame: number;
}

interface HeldEventRow {
  id: string;
  title: string;
  start_time: string;
  timezone: string | null;
  going: number;
  checked_in: number;
  said_going_and_came: number;
}

export async function fetchOrganizationEvents(
  organizationId: string,
  days: number,
): Promise<Result<HeldEvent[]>> {
  const result = await call(
    'my_organization_events',
    { p_organization: organizationId, p_days: days },
    'Could not load the organization’s events.',
  );
  if (!result.ok) return result;
  return {
    ok: true,
    value: ((result.value as HeldEventRow[] | null) ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      startTime: row.start_time,
      timezone: row.timezone,
      going: row.going,
      checkedIn: row.checked_in,
      saidGoingAndCame: row.said_going_and_came,
    })),
  };
}

export async function withdrawIntroduction(id: string): Promise<Result<null>> {
  const result = await call(
    'withdraw_introduction',
    { p_introduction: id },
    'The introduction was not withdrawn.',
  );
  return result.ok ? { ok: true, value: null } : result;
}

/* ----------------------------------------------------------------- title */

export interface PartnerCard {
  title: string;
  heading: string | null;
  body: string | null;
}

export async function fetchMyPartnerCard(): Promise<Result<PartnerCard | null>> {
  const result = await call('my_partner_card', {}, 'Could not load your card.');
  if (!result.ok) return result;
  const row = (
    result.value as
      | { title: string; card_heading: string | null; card_body: string | null }[]
      | null
  )?.[0];
  return {
    ok: true,
    value: row ? { title: row.title, heading: row.card_heading, body: row.card_body } : null,
  };
}
