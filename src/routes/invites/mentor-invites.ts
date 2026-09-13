import { toE164 } from '@/lib/phone';
import { getSupabase } from '@/lib/supabase';

/**
 * A mentor's own two invites.
 *
 * Unlike the administrator's tools next door, none of this goes through an
 * `admin_*` function. A mentor reads, issues and withdraws their own invites
 * against the `invites` table directly, because three policies already say
 * exactly that much and nothing more:
 *
 *   mentors can see invites they sent        (select, own rows only)
 *   mentors can invite up to two people      (insert, capped at two live)
 *   mentors can revoke their own pending     (update, pending rows only)
 *
 * So there is no select filter on `invited_by_member_id` below and no
 * ownership check before withdrawing. Adding either would read as the
 * permission check, and it is not — the database is. See
 * supabase/tests/mentor-invites.sql, which runs every one of those policies as
 * a real mentor session.
 */

export interface MentorInvite {
  id: string;
  phone: string;
  status: 'pending' | 'consumed' | 'revoked';
  note: string | null;
  createdAt: string;
}

interface MentorInviteRow {
  id: string;
  phone: string;
  status: string;
  note: string | null;
  created_at: string;
}

/** What CONTEXT.md promises a mentor, and what the insert policy enforces. */
export const MENTOR_ALLOWANCE = 2;

export async function fetchMyInvites(): Promise<
  { ok: true; invites: MentorInvite[] } | { ok: false; error: string }
> {
  const result = await getSupabase()
    .from('invites')
    .select('id, phone, status, note, created_at')
    .order('created_at', { ascending: false });
  if (result.error) return { ok: false, error: result.error.message };
  return {
    ok: true,
    invites: (result.data as MentorInviteRow[]).map((row) => ({
      id: row.id,
      phone: row.phone,
      status: row.status as MentorInvite['status'],
      note: row.note,
      createdAt: row.created_at,
    })),
  };
}

export async function createMyInvite(input: {
  phone: string;
  memberId: string;
  note: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getSupabase()
    .from('invites')
    .insert({
      phone_raw: toE164(input.phone) ?? input.phone,
      invited_by_member_id: input.memberId,
      note: input.note,
    });
  return error ? { ok: false, error: describeFailure(error.code, error.message) } : { ok: true };
}

/**
 * Withdrawing sets the row to revoked rather than deleting it, the same way
 * `admin_revoke_invite` does: who vouched for whom stays on record, and
 * `live_invite_count` ignores revoked rows, so the slot comes back.
 */
export async function withdrawMyInvite(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getSupabase()
    .from('invites')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', id);
  return error ? { ok: false, error: describeFailure(error.code, error.message) } : { ok: true };
}

/* ------------------------------------------------------------ pure helpers */

/**
 * The allowance, counted the way the database counts it.
 *
 * Mirrors `live_invite_count()`: pending and consumed both spend a slot,
 * revoked does not. Somebody who joined is still using the invite that let
 * them in — the slot comes back when they leave, not when they arrive.
 */
export function liveCount(invites: MentorInvite[]): number {
  return invites.filter((i) => i.status === 'pending' || i.status === 'consumed').length;
}

export function slotsLeft(invites: MentorInvite[]): number {
  return Math.max(0, MENTOR_ALLOWANCE - liveCount(invites));
}

/**
 * What an invite is doing, in English, for the person who sent it.
 *
 * Deliberately not the administrator's wording. `/admin` says "used by Dana"
 * because an administrator needs to know who is on a number; a mentor cannot
 * read the roster and does not need to be told the name of somebody they
 * invited themselves.
 */
export function inviteState(invite: MentorInvite): string {
  if (invite.status === 'revoked') return 'withdrawn';
  if (invite.status === 'consumed') return 'joined the club';
  return 'waiting for them to join';
}

/** Only a pending invite. Once somebody is on the number, removing them is an administrator's job. */
export function canWithdraw(invite: MentorInvite): boolean {
  return invite.status === 'pending';
}

/**
 * Turning the database's refusal into a sentence.
 *
 * The same action fails two different ways and the codes are the only honest
 * way to tell them apart, which supabase/tests/mentor-invites.sql demonstrates
 * at steps 12 and 13: with the allowance full, an already-listed number is
 * refused by the *cap* and never reaches the unique index. So "refused" cannot
 * be read as "that number is taken", and a message that guessed would be
 * wrong exactly when a mentor was already confused.
 *
 * 23505 is invites_live_phone_idx — the number is on the list. It may be on it
 * because of somebody else's invite, which this mentor cannot see, so the
 * sentence says what is true without implying they put it there.
 *
 * 42501 is the insert policy. At this point that means the allowance, since
 * the form supplies the mentor's own id and never a claim.
 */
export function describeFailure(code: string | undefined, message: string): string {
  if (code === '23505') return 'That number is already on the club’s list.';
  if (code === '42501') return 'You have used both of your invites.';
  return message;
}
