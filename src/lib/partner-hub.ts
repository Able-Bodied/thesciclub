import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * What a trusted partner sees of their own work (20261029100000): who they
 * invited or introduced, their own counts, their introductions, and their
 * card. The database answers only for the signed-in partner.
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

export async function withdrawIntroduction(id: string): Promise<Result<null>> {
  const result = await call(
    'withdraw_introduction',
    { p_introduction: id },
    'The introduction was not withdrawn.',
  );
  return result.ok ? { ok: true, value: null } : result;
}

/* ------------------------------------------------------------------ card */

export interface PartnerCard {
  title: string;
  heading: string | null;
  body: string | null;
}

export const CARD_HEADING_MAX = 80;
export const CARD_BODY_MAX = 400;
export const DEFAULT_CARD_HEADING = 'Meet people who get it';
export const DEFAULT_CARD_BODY =
  'The SCI Club is a private community for adults living with spinal cord injury or disease, and the people close to them. Scan to join.';

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

export async function saveMyPartnerCard(heading: string, body: string): Promise<Result<null>> {
  const result = await call(
    'set_my_partner_card',
    { p_heading: heading.trim() || null, p_body: body.trim() || null },
    'Your card was not saved.',
  );
  return result.ok ? { ok: true, value: null } : result;
}
